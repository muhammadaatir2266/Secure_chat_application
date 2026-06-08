'use client';

import { useState, useEffect, useRef } from 'react';
import { useCrypto } from './hooks/useCrypto';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Shield, Lock, Unlock, Send, Wifi, WifiOff, Loader2, Users, UserCircle, Edit2 } from 'lucide-react';

interface Message {
  text: string;
  isOwn: boolean;
  timestamp: Date;
  id: string;
  senderName?: string;
}

export default function Home() {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [keyExchanged, setKeyExchanged] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState(1);
  const [username, setUsername] = useState('');
  const [tempUsername, setTempUsername] = useState('');
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [peerName, setPeerName] = useState('Peer');
  
  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const { initDH, computeSharedSecret, encrypt, decrypt, getPublicKey, getSharedSecretHash } = useCrypto();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSetUsername = () => {
    if (tempUsername.trim()) {
      const newUsername = tempUsername.trim();
      setUsername(newUsername);
      setShowNameDialog(false);
      // Auto-connect after setting username for the first time
      if (!connected && !connecting) {
        // Use setTimeout to ensure dialog closes smoothly
        setTimeout(() => {
          connect(newUsername);
        }, 100);
      }
    }
  };

  const handleEditUsername = () => {
    setTempUsername(username);
    setShowNameDialog(true);
  };

  const startConnect = () => {
    if (!username) {
      setShowNameDialog(true);
    } else {
      connect(username);
    }
  };

  const connect = async (userName: string) => {
    if (connecting) return;
    
    try {
      console.log('Starting connection...');
      setConnecting(true);
      await initDH();
      console.log('DH initialized');
      
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:8765';
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket opened');
        setConnected(true);
        setConnecting(false);
        setMessages(prev => [...prev, {
          text: '✅ Connected to server',
          isOwn: false,
          timestamp: new Date(),
          id: Date.now().toString()
        }]);

        const publicKey = getPublicKey();
        console.log('Sending public key:', publicKey.substring(0, 50) + '...');
        const message = JSON.stringify({
          type: 'key_exchange',
          public_key: publicKey,
          username: userName
        });
        ws.send(message);
        
        setTimeout(() => inputRef.current?.focus(), 100);
      };

      ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          console.log('Received message:', data.type);
          
          if (data.type === 'key_exchange') {
            console.log('Received key exchange from:', data.username || 'unknown');
            
            // Store peer's username if provided
            if (data.username) {
              setPeerName(data.username);
              console.log('Peer name set to:', data.username);
            }
            
            // Check if we already exchanged keys to prevent duplicate processing
            const currentHash = getSharedSecretHash();
            if (currentHash !== 'Not established') {
              console.log('Key already exchanged, ignoring duplicate');
              return;
            }
            
            console.log('Starting key exchange...');
            
            // Complete the key exchange with received public key
            await computeSharedSecret(data.public_key);
            setKeyExchanged(true);
            const hash = getSharedSecretHash();
            console.log('Key exchange complete! Hash:', hash.substring(0, 16));
            
            setMessages(prev => [...prev, {
              text: `🔒 Secure connection established with ${data.username || 'peer'}!`,
              isOwn: false,
              timestamp: new Date(),
              id: Date.now().toString()
            }]);
            setOnlineUsers(2);
            
            // Send our public key back to complete the handshake for the other client
            // Only if this is the first exchange (they haven't received ours yet)
            const ourPublicKey = getPublicKey();
            const response = JSON.stringify({
              type: 'key_exchange',
              public_key: ourPublicKey,
              username: userName
            });
            ws.send(response);
            console.log('Sent our public key in response');
            
          } else if (data.type === 'encrypted_message') {
            setIsTyping(true);
            setTimeout(() => setIsTyping(false), 500);
            
            const plaintext = await decrypt(data.nonce, data.ciphertext);
            setMessages(prev => [...prev, {
              text: plaintext,
              isOwn: false,
              timestamp: new Date(),
              id: Date.now().toString(),
              senderName: data.senderName || peerName
            }]);
          }
        } catch (error) {
          console.error('Error processing message:', error);
        }
      };

      ws.onclose = () => {
        setConnected(false);
        setConnecting(false);
        setKeyExchanged(false);
        setMessages(prev => [...prev, {
          text: '❌ Disconnected from server',
          isOwn: false,
          timestamp: new Date(),
          id: Date.now().toString()
        }]);
        setOnlineUsers(1);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setConnecting(false);
      };

    } catch (error) {
      console.error('Connection failed:', error);
      setConnecting(false);
    }
  };

  const disconnect = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
  };

  const sendMessage = async () => {
    if (!inputMessage.trim() || !keyExchanged || !wsRef.current) return;

    const messageText = inputMessage;
    setInputMessage('');
    
    try {
      const { nonce, ciphertext } = await encrypt(messageText);
      
      const message = JSON.stringify({
        type: 'encrypted_message',
        nonce,
        ciphertext,
        senderName: username
      });
      
      wsRef.current.send(message);
      
      setMessages(prev => [...prev, {
        text: messageText,
        isOwn: true,
        timestamp: new Date(),
        id: Date.now().toString(),
        senderName: username
      }]);
      
      inputRef.current?.focus();
    } catch (error) {
      console.error('Error sending message:', error);
      setInputMessage(messageText);
    }
  };

  return (
    <div className="h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50 p-4 flex items-center justify-center">
      {/* Username Dialog */}
      <Dialog open={showNameDialog} onOpenChange={setShowNameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Welcome to Secure Chat</DialogTitle>
            <DialogDescription>
              Please enter your name to continue. This will be shown to other users.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="username">Your Name</Label>
              <Input
                id="username"
                placeholder="Enter your name..."
                value={tempUsername}
                onChange={(e) => setTempUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSetUsername()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSetUsername} disabled={!tempUsername.trim()}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <div className="w-full max-w-7xl h-[calc(100vh-2rem)]">
        <Card className="shadow-2xl border-2 flex flex-col md:flex-row h-full overflow-hidden">
          {/* Left Sidebar - Connection Controls */}
          <div className="w-full md:w-64 bg-gradient-to-b from-slate-100 to-slate-50 border-r border-slate-200 p-3 space-y-3 overflow-y-auto">
            {/* User Profile Section */}
            <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-200">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-full flex items-center justify-center text-white font-bold">
                  {username ? username.charAt(0).toUpperCase() : '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 truncate">
                    {username || 'Guest'}
                  </p>
                  <p className="text-xs text-slate-500">Your Profile</p>
                </div>
              </div>
              {username && (
                <Button
                  onClick={handleEditUsername}
                  variant="outline"
                  size="sm"
                  className="w-full gap-2 h-8 text-xs"
                >
                  <Edit2 className="w-3 h-3" />
                  Edit Name
                </Button>
              )}
            </div>

            {/* Connection Buttons */}
            <div className="space-y-2">
              <Button
                onClick={startConnect}
                disabled={connected || connecting}
                className="w-full gap-2 h-10"
              >
                {connecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Connecting...
                  </>
                ) : (
                  <>
                    <Wifi className="w-4 h-4" />
                    Connect
                  </>
                )}
              </Button>
              <Button
                onClick={disconnect}
                disabled={!connected}
                variant="destructive"
                className="w-full gap-2 h-10"
              >
                <WifiOff className="w-4 h-4" />
                Disconnect
              </Button>
            </div>

            {/* Status Section */}
            <div className="bg-white rounded-lg p-3 shadow-sm border border-slate-200 space-y-2">
              <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
                Connection Status
              </h3>
              
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Connection</span>
                  <Badge variant={connected ? "default" : "secondary"} className="gap-1 text-xs h-5">
                    {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
                    {connected ? 'Online' : 'Offline'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-600">Encryption</span>
                  <Badge variant={keyExchanged ? "default" : "secondary"} className="gap-1 text-xs h-5">
                    {keyExchanged ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                    {keyExchanged ? 'Secured' : 'Unsecured'}
                  </Badge>
                </div>
                
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="text-xs text-slate-600">Users Online</span>
                  <Badge variant="outline" className="gap-1 text-xs h-5">
                    <Users className="w-3 h-3" />
                    {onlineUsers}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Security Info */}
            {keyExchanged && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-2">
                <div className="flex items-start gap-2">
                  <Shield className="w-4 h-4 text-green-600 mt-0.5" />
                  <div>
                    <p className="text-xs font-semibold text-green-900">End-to-End Encrypted</p>
                    <p className="text-xs text-green-700 mt-0.5">AES-256-GCM + ECDH</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Right Side - Chat Area */}
          <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <CardHeader className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white flex-shrink-0 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Shield className="w-7 h-7" />
                  <div>
                    <h1 className="text-xl font-bold">Secure Chat</h1>
                    <p className="text-xs text-blue-100 mt-0.5">
                      {keyExchanged && peerName !== 'Peer' 
                        ? `Chatting with ${peerName}` 
                        : 'Private Encrypted Messaging'}
                    </p>
                  </div>
                </div>
              </div>
            </CardHeader>

            {/* Chat Area */}
            <div className="flex-1 overflow-hidden bg-slate-50">
              <ScrollArea className="h-full p-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                    <Shield className="w-16 h-16 mb-4 opacity-20" />
                    <p className="text-lg font-medium">No messages yet</p>
                    <p className="text-sm text-center">
                      {keyExchanged 
                        ? 'Start a secure conversation' 
                        : 'Waiting for another user to connect for key exchange...'}
                    </p>
                    {!keyExchanged && connected && (
                      <p className="text-xs mt-2 text-orange-500">
                        💡 Open another browser tab to complete key exchange
                      </p>
                    )}
                  </div>
                )}
              
              <div className="space-y-4">
                {messages.map((msg) => {
                  const isSystem = msg.text.includes('🔒') || msg.text.includes('❌') || msg.text.includes('✅');
                  
                  return (
                    <div
                      key={msg.id}
                      className={`flex ${msg.isOwn ? 'justify-end' : 'justify-start'} animate-in slide-in-from-bottom-2 duration-300`}
                    >
                      {isSystem ? (
                        <div className="bg-muted px-4 py-2 rounded-lg text-sm text-muted-foreground italic">
                          {msg.text}
                        </div>
                      ) : (
                        <div
                          className={`max-w-md px-4 py-3 rounded-2xl shadow-sm ${
                            msg.isOwn
                              ? 'bg-primary text-primary-foreground rounded-br-sm'
                              : 'bg-[#DCF8C6] text-gray-800 rounded-bl-sm'
                          }`}
                        >
                          <p className="text-xs font-semibold mb-1 opacity-70">
                            {msg.isOwn ? (msg.senderName || 'You') : (msg.senderName || peerName)}
                          </p>
                          <p className="break-words">{msg.text}</p>
                          <p className="text-xs mt-1 opacity-60">
                            {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
                
                {isTyping && (
                  <div className="flex justify-start animate-in slide-in-from-bottom-2">
                    <div className="bg-secondary px-4 py-3 rounded-2xl rounded-bl-sm">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>
              </ScrollArea>
            </div>

            <Separator />

            {/* Message Input */}
            <div className="p-3 bg-white border-t border-slate-200 flex-shrink-0">
              <div className="flex gap-2">
                <Input
                  ref={inputRef}
                  type="text"
                  value={inputMessage}
                  onChange={(e) => setInputMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
                  placeholder={keyExchanged ? "Type your encrypted message..." : "Connect to start chatting..."}
                  disabled={!keyExchanged}
                  className="flex-1 h-10"
                />
                <Button
                  onClick={sendMessage}
                  disabled={!keyExchanged || !inputMessage.trim()}
                  size="lg"
                  className="gap-2 px-5 h-10"
                >
                  <Send className="w-4 h-4" />
                  Send
                </Button>
              </div>
              {keyExchanged && (
                <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
                  <Lock className="w-3 h-3" />
                  End-to-end encrypted with AES-256-GCM
                </p>
              )}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
