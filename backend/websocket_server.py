"""
WebSocket server bridge for browser clients.
Bridges WebSocket connections to the TCP chat server.
"""

import asyncio
import websockets
import json
import socket
import threading
import logging
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class WebSocketBridge:
    """Bridge between WebSocket (browser) and TCP socket (chat server)."""
    
    def __init__(self, chat_server_host: str = '127.0.0.1', chat_server_port: int = 5555):
        self.chat_server_host = chat_server_host
        self.chat_server_port = chat_server_port
        self.tcp_socket: Optional[socket.socket] = None
        self.websocket: Optional[websockets.WebSocketServerProtocol] = None
        self.loop: Optional[asyncio.AbstractEventLoop] = None
        self.connected = False
        
    async def handle_client(self, websocket):
        """Handle WebSocket client connection."""
        self.websocket = websocket
        self.loop = asyncio.get_event_loop()  # Store the event loop
        logger.info(f"WebSocket client connected from {websocket.remote_address}")
        
        # Connect to TCP chat server
        try:
            self.tcp_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.tcp_socket.connect((self.chat_server_host, self.chat_server_port))
            self.connected = True
            logger.info("Connected to chat server")
            
            # Start TCP receiver thread
            tcp_thread = threading.Thread(target=self.receive_from_tcp, daemon=True)
            tcp_thread.start()
            
            # Handle WebSocket messages
            async for message in websocket:
                if self.connected:
                    self.send_to_tcp(message)
                    
        except Exception as e:
            logger.error(f"Error in WebSocket bridge: {e}")
        finally:
            self.cleanup()
    
    def send_to_tcp(self, message: str):
        """Send message from WebSocket to TCP server."""
        try:
            message_bytes = message.encode('utf-8')
            length_bytes = len(message_bytes).to_bytes(4, byteorder='big')
            self.tcp_socket.sendall(length_bytes + message_bytes)
            logger.debug(f"Sent to TCP: {len(message_bytes)} bytes")
        except Exception as e:
            logger.error(f"Error sending to TCP: {e}")
            self.cleanup()
    
    def receive_from_tcp(self):
        """Receive messages from TCP server and forward to WebSocket."""
        try:
            while self.connected:
                # Receive length prefix
                length_bytes = self.receive_exact(4)
                if not length_bytes:
                    break
                
                message_length = int.from_bytes(length_bytes, byteorder='big')
                
                # Receive message
                message_data = self.receive_exact(message_length)
                if not message_data:
                    break
                
                # Send to WebSocket using the stored event loop
                message_str = message_data.decode('utf-8')
                if self.websocket and self.loop:
                    try:
                        # Schedule the coroutine in the main event loop
                        future = asyncio.run_coroutine_threadsafe(
                            self.websocket.send(message_str),
                            self.loop
                        )
                        # Wait for it to complete with a timeout
                        future.result(timeout=5.0)
                        logger.debug(f"Forwarded to WebSocket: {len(message_str)} bytes")
                    except Exception as e:
                        logger.error(f"Error sending to WebSocket: {e}")
                        break
                    
        except Exception as e:
            logger.error(f"Error receiving from TCP: {e}")
        finally:
            self.cleanup()
    
    def receive_exact(self, num_bytes: int) -> bytes:
        """Receive exact number of bytes from TCP socket."""
        data = b''
        while len(data) < num_bytes:
            chunk = self.tcp_socket.recv(num_bytes - len(data))
            if not chunk:
                return b''
            data += chunk
        return data
    
    def cleanup(self):
        """Clean up connections."""
        self.connected = False
        if self.tcp_socket:
            try:
                self.tcp_socket.close()
            except:
                pass
        logger.info("Bridge connection closed")


async def main():
    """Start WebSocket server."""
    async def handler(websocket):
        bridge = WebSocketBridge()
        await bridge.handle_client(websocket)
    
    server = await websockets.serve(handler, "localhost", 8765)
    
    print("="*60)
    print("WebSocket Bridge Server")
    print("="*60)
    print("WebSocket Server: ws://localhost:8765")
    print("Chat Server: 127.0.0.1:5555")
    print("Ready for browser connections...")
    print("="*60)
    
    await server.wait_closed()


if __name__ == "__main__":
    asyncio.run(main())
