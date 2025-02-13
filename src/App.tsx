import React, { useState, useRef } from 'react';
import { Upload, Download, Check } from 'lucide-react';
import { format, parse, isValid } from 'date-fns';
import jsPDF from 'jspdf';

interface Message {
  text: string;
  timestamp: Date;
  sender: string;
  isSent: boolean;
  type?: 'voice' | 'text';
  originalTime?: string;
}

function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const parseWhatsAppMessage = (line: string): Message | null => {
    // WhatsApp message format: [DD/MM/YY, HH:mm:ss] Sender Name: Message
    const messageRegex = /\[?(\d{1,2}\/\d{1,2}\/\d{2,4}),\s*(\d{1,2}:\d{2}(?::\d{2})?)\s*((?:AM|PM)?)\]?\s*([^:]+):\s*(.+)/i;
    const match = line.match(messageRegex);

    if (!match) return null;

    const [_, dateStr, timeStr, period, sender, text] = match;
    
    // Store original time format
    const originalTime = `${timeStr}${period ? ' ' + period.toUpperCase() : ''}`;
    
    // Parse date and time
    const dateTimeStr = `${dateStr} ${timeStr}${period ? ' ' + period : ''}`;
    let timestamp = parse(dateTimeStr, 'dd/MM/yy h:mm a', new Date());
    
    // If the first parse fails, try alternative format
    if (!isValid(timestamp)) {
      timestamp = parse(dateTimeStr, 'dd/MM/yyyy HH:mm', new Date());
    }

    // If still invalid, use current date/time
    if (!isValid(timestamp)) {
      timestamp = new Date();
    }

    const isVoiceCall = text.toLowerCase().includes('voice call') || 
                       text.toLowerCase().includes('missed call');

    // Remove any AM/PM from sender name
    const cleanSender = sender.replace(/\s*(?:AM|PM)\s*$/i, '').trim();

    return {
      text: text.trim(),
      timestamp,
      sender: cleanSender,
      isSent: cleanSender.toLowerCase().includes('you'),
      type: isVoiceCall ? 'voice' : 'text',
      originalTime
    };
  };

  const formatMessageTime = (timestamp: Date, originalTime: string | undefined) => {
    // If original time had PM, use 12-hour format with PM
    if (originalTime?.includes('PM')) {
      return format(timestamp, 'h:mm') + ' PM';
    }
    // If original time had AM, use 12-hour format with AM
    if (originalTime?.includes('AM')) {
      return format(timestamp, 'h:mm') + ' AM';
    }
    // Otherwise use 24-hour format
    return format(timestamp, 'HH:mm');
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result as string;
      const lines = text.split('\n').filter(line => line.trim());
      
      const parsedMessages = lines
        .map(parseWhatsAppMessage)
        .filter((msg): msg is Message => msg !== null);

      setMessages(parsedMessages);
      setIsLoading(false);
    };

    reader.readAsText(file);
  };

  const generatePDF = () => {
    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'pt',
      format: 'a4'
    });
    
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 40;
    let yPosition = 80;

    // Add dark background
    pdf.setFillColor(18, 27, 34);
    pdf.rect(0, 0, pageWidth, pageHeight, 'F');

    // Add WhatsApp header
    pdf.setFillColor(32, 44, 51);
    pdf.rect(0, 0, pageWidth, 60, 'F');

    // Add header text with the chat name (using the first non-you sender)
    pdf.setTextColor(255, 255, 255);
    pdf.setFontSize(16);
    const chatName = messages.find(m => !m.isSent)?.sender || 'WhatsApp Chat';
    pdf.text(chatName, margin, 35);

    // Group messages by date
    let currentDate = '';
    messages.forEach((message) => {
      const messageDate = format(message.timestamp, 'EEEE, MMMM d, yyyy');
      
      // Add date divider if it's a new date
      if (currentDate !== messageDate) {
        currentDate = messageDate;
        
        // Add date divider
        pdf.setFillColor(0, 0, 0, 0.2);
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(12);
        const dateWidth = pdf.getTextWidth(messageDate);
        const dateX = (pageWidth - dateWidth) / 2;
        pdf.roundedRect(dateX - 10, yPosition - 15, dateWidth + 20, 25, 3, 3, 'F');
        pdf.text(messageDate, dateX, yPosition);
        yPosition += 40;

        // Add encryption notice on first date only
        if (messages.indexOf(message) === 0) {
          pdf.setFontSize(10);
          pdf.setTextColor(200, 200, 200);
          const encryptionText = 'Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.';
          const encryptionWidth = pdf.getTextWidth(encryptionText);
          const encryptionX = (pageWidth - encryptionWidth) / 2;
          pdf.text(encryptionText, encryptionX, yPosition);
          yPosition += 40;
        }
      }

      // Reset text color for messages
      pdf.setFontSize(12);

      if (message.type === 'voice') {
        // Handle voice call messages
        const callText = 'Missed voice call';
        const callWidth = pdf.getTextWidth(callText) + 60;
        const xPosition = (pageWidth - callWidth) / 2;
        
        pdf.setFillColor(32, 44, 51);
        pdf.roundedRect(xPosition, yPosition - 15, callWidth, 40, 3, 3, 'F');
        
        // Add phone icon placeholder
        pdf.setTextColor(255, 0, 0);
        pdf.text('📞', xPosition + 15, yPosition + 5);
        
        // Add call text
        pdf.setTextColor(255, 255, 255);
        pdf.text(callText, xPosition + 35, yPosition + 5);
        
        // Add timestamp for voice call
        const messageTime = formatMessageTime(message.timestamp, message.originalTime);
        pdf.setFontSize(9);
        pdf.setTextColor(200, 200, 200);
        pdf.text(messageTime, xPosition + callWidth - 35, yPosition + 5);
        
        yPosition += 50;
      } else {
        // Regular text messages
        const bubbleColor = message.isSent ? [0, 128, 105] : [32, 44, 51];
        const messageTime = formatMessageTime(message.timestamp, message.originalTime);
        const textWidth = pdf.getTextWidth(message.text);
        const bubbleWidth = Math.min(textWidth + 60, pageWidth - 120);
        const bubbleHeight = 45;
        const xPosition = message.isSent ? pageWidth - margin - bubbleWidth : margin;

        // Draw message bubble
        pdf.setFillColor(bubbleColor[0], bubbleColor[1], bubbleColor[2]);
        pdf.roundedRect(xPosition, yPosition - 15, bubbleWidth, bubbleHeight, 3, 3, 'F');

        // Add sender name for received messages
        if (!message.isSent) {
          pdf.setFontSize(10);
          pdf.setTextColor(0, 150, 136);
          pdf.text(message.sender, xPosition + 15, yPosition);
          yPosition += 15;
        }

        // Add message text
        pdf.setTextColor(255, 255, 255);
        pdf.setFontSize(12);
        pdf.text(message.text, xPosition + 15, yPosition + 5);
        
        // Add timestamp with proper alignment
        pdf.setFontSize(9);
        pdf.setTextColor(200, 200, 200);
        const timeWidth = pdf.getTextWidth(messageTime);
        pdf.text(messageTime, xPosition + bubbleWidth - timeWidth - 10, yPosition + 15);

        yPosition += 50;
      }

      // Add new page if needed
      if (yPosition > pageHeight - 40) {
        pdf.addPage();
        yPosition = 40;
        // Add dark background to new page
        pdf.setFillColor(18, 27, 34);
        pdf.rect(0, 0, pageWidth, pageHeight, 'F');
      }
    });

    pdf.save('whatsapp-chat.pdf');
    
    // Show success message
    setShowSuccess(true);
    // Hide after 3 seconds
    setTimeout(() => {
      setShowSuccess(false);
    }, 3000);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-900 via-gray-900 to-gray-800 flex flex-col items-center justify-center p-4 sm:p-6">
      {/* Success Notification */}
      {showSuccess && (
        <div className="fixed top-4 right-4 bg-green-500 text-white px-6 py-3 rounded-lg shadow-lg flex items-center space-x-2 animate-fade-in-down">
          <Check className="w-5 h-5" />
          <span>PDF downloaded successfully!</span>
        </div>
      )}

      <div className="w-full max-w-2xl mx-auto">
        <div className="text-center space-y-3 mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold bg-gradient-to-r from-white via-white to-gray-300 text-transparent bg-clip-text">
            ChatPrint
          </h1>
          <p className="text-gray-400 text-lg sm:text-xl">
            Upload your WhatsApp chat export (.txt file) and convert it into a styled PDF
          </p>
        </div>

        <div className="group relative">
          <div className="absolute inset-0 bg-gradient-to-r from-green-500/20 to-green-500/30 rounded-xl blur-xl transition-all duration-500 group-hover:blur-2xl opacity-50" />
          <div 
            className="relative border-2 border-dashed border-gray-600 rounded-xl p-8 sm:p-12 transition-all duration-300 hover:border-green-500/50 cursor-pointer"
            onClick={() => fileInputRef.current?.click()}
          >
            <div className="flex flex-col items-center justify-center gap-4 text-center">
              <div className="h-16 w-16 rounded-full bg-gray-800/50 flex items-center justify-center">
                <Upload className="h-8 w-8 text-gray-400" />
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-semibold text-gray-200">Click to upload or drag and drop</h3>
                <p className="text-sm text-gray-400">WhatsApp chat export (.txt) only</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".txt"
              onChange={handleFileUpload}
              className="hidden"
            />
          </div>
        </div>

        {/* Messages preview section */}
        {messages.length > 0 && (
          <div className="space-y-4">
            <div className="bg-[#0a1014] rounded-lg p-4 max-h-96 overflow-y-auto">
              {/* Group messages by date */}
              {Object.entries(
                messages.reduce((groups, message) => {
                  const date = format(message.timestamp, 'EEEE, MMMM d, yyyy');
                  return {
                    ...groups,
                    [date]: [...(groups[date] || []), message],
                  };
                }, {} as Record<string, Message[]>)
              ).map(([date, dateMessages], groupIndex) => (
                <div key={date} className="mb-6">
                  <div className="flex justify-center">
                    <div className="bg-black/20 text-white text-center text-sm py-1 px-3 rounded-lg inline-block mb-4">
                      {date}
                    </div>
                  </div>
                  
                  {groupIndex === 0 && (
                    <div className="text-gray-300 text-center text-xs mb-4 px-8">
                      Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.
                    </div>
                  )}

                  {dateMessages.map((message, index) => (
                    <div
                      key={index}
                      className={`flex ${message.isSent ? 'justify-end' : 'justify-start'} mb-2`}
                    >
                      {message.type === 'voice' ? (
                        <div className="bg-[#222e35] rounded-lg px-4 py-3 flex items-center space-x-2 max-w-[70%]">
                          <span className="text-red-500">📞</span>
                          <span className="text-white">Missed voice call</span>
                          <span className="text-xs text-gray-400 ml-2">
                            {formatMessageTime(message.timestamp, message.originalTime)}
                          </span>
                        </div>
                      ) : (
                        <div
                          className={`rounded-lg px-4 py-2 max-w-[70%] relative ${
                            message.isSent ? 'bg-[#005c4b]' : 'bg-[#222e35]'
                          }`}
                        >
                          {!message.isSent && (
                            <p className="text-sm text-teal-400 mb-1">{message.sender}</p>
                          )}
                          <p className="text-white mb-4">{message.text}</p>
                          <p className="text-[11px] text-gray-400 absolute bottom-1 right-3">
                            {formatMessageTime(message.timestamp, message.originalTime)}
                          </p>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            <button
              onClick={generatePDF}
              className="w-full bg-green-600 text-white py-3 px-6 rounded-lg hover:bg-green-700 transition-colors flex items-center justify-center space-x-2"
              disabled={isLoading}
            >
              <Download className="w-5 h-5" />
              <span>Download PDF</span>
            </button>
          </div>
        )}

        {/* Footer */}
        <footer className="mt-12 text-center space-y-4">
          <p className="text-gray-400">
            Created with <span className="text-red-500 animate-pulse">❤️</span> by{" "}
            <span className="text-gray-300">Chetan Yadav</span>
          </p>
          <div className="flex items-center justify-center gap-6">
            <a 
              href="https://x.com/Chetany0724" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-green-500 transition-colors"
            >
              Twitter
            </a>
            <a 
              href="https://www.linkedin.com/in/chetan0724/" 
              target="_blank" 
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-green-500 transition-colors"
            >
              LinkedIn
            </a>
            <a 
              href="mailto:ydvchetan01@gmail.com"
              className="text-gray-400 hover:text-green-500 transition-colors"
            >
              Email
            </a>
          </div>
        </footer>
      </div>
    </div>
  );
}

export default App;