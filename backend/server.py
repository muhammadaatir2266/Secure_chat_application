"""
Server component for secure chat application.
Relays encrypted messages between connected clients.
"""

import socket
import threading
import json
import logging
from datetime import datetime
from typing import List, Dict

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


class ChatServer:
    """
    Relay server for encrypted chat messages.
    Does not decrypt messages - maintains end-to-end encryption.
    """
    
    def __init__(self, host: str = '127.0.0.1', port: int = 5555):
        """
        Initialize chat server.
        
        Args:
            host: Host address to bind
            port: Port number to listen on
        """
        self.host = host
        self.port = port
        self.clients: List[socket.socket] = []
        self.server_socket = None
        self.running = False
        
    def start(self):
        """Start the server and listen for connections."""
        self.server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.server_socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        
        try:
            self.server_socket.bind((self.host, self.port))
            self.server_socket.listen(5)
            self.running = True
            logger.info(f"Server started on {self.host}:{self.port}")
            
            # Accept connections
            while self.running:
                try:
                    client_socket, address = self.server_socket.accept()
                    logger.info(f"New connection from {address}")
                    self.clients.append(client_socket)
                    
                    # Handle client in separate thread
                    client_thread = threading.Thread(
                        target=self.handle_client,
                        args=(client_socket, address),
                        daemon=True
                    )
                    client_thread.start()
                    
                except Exception as e:
                    if self.running:
                        logger.error(f"Error accepting connection: {e}")
                        
        except Exception as e:
            logger.error(f"Server error: {e}")
        finally:
            self.stop()
    
    def handle_client(self, client_socket: socket.socket, address: tuple):
        """
        Handle messages from a connected client.
        
        Args:
            client_socket: Client's socket
            address: Client's address
        """
        try:
            while self.running:
                # Receive message length first (4 bytes)
                length_bytes = self.receive_exact(client_socket, 4)
                if not length_bytes:
                    break
                    
                message_length = int.from_bytes(length_bytes, byteorder='big')
                
                # Receive actual message
                message_data = self.receive_exact(client_socket, message_length)
                if not message_data:
                    break
                
                # Broadcast to all other clients
                self.broadcast(message_data, client_socket)
                
        except Exception as e:
            logger.error(f"Error handling client {address}: {e}")
        finally:
            self.remove_client(client_socket)
            logger.info(f"Client {address} disconnected")
    
    def receive_exact(self, sock: socket.socket, num_bytes: int) -> bytes:
        """
        Receive exact number of bytes from socket.
        
        Args:
            sock: Socket to receive from
            num_bytes: Number of bytes to receive
            
        Returns:
            bytes: Received data or empty bytes if connection closed
        """
        data = b''
        while len(data) < num_bytes:
            chunk = sock.recv(num_bytes - len(data))
            if not chunk:
                return b''
            data += chunk
        return data
    
    def broadcast(self, message: bytes, sender_socket: socket.socket):
        """
        Broadcast message to all clients except sender.
        
        Args:
            message: Message data to broadcast
            sender_socket: Socket of the sender
        """
        for client in self.clients:
            if client != sender_socket:
                try:
                    # Send length prefix
                    length_bytes = len(message).to_bytes(4, byteorder='big')
                    client.sendall(length_bytes + message)
                except Exception as e:
                    logger.error(f"Error broadcasting to client: {e}")
                    self.remove_client(client)
    
    def remove_client(self, client_socket: socket.socket):
        """
        Remove client from active clients list.
        
        Args:
            client_socket: Socket to remove
        """
        if client_socket in self.clients:
            self.clients.remove(client_socket)
            try:
                client_socket.close()
            except:
                pass
    
    def stop(self):
        """Stop the server and close all connections."""
        self.running = False
        
        # Close all client connections
        for client in self.clients[:]:
            self.remove_client(client)
        
        # Close server socket
        if self.server_socket:
            try:
                self.server_socket.close()
            except:
                pass
        
        logger.info("Server stopped")


def main():
    """Run the chat server."""
    server = ChatServer(host='127.0.0.1', port=5555)
    
    print("=" * 60)
    print("SECURE CHAT SERVER")
    print("=" * 60)
    print(f"Starting server on 127.0.0.1:5555")
    print("Waiting for clients to connect...")
    print("Press Ctrl+C to stop the server")
    print("=" * 60)
    
    try:
        server.start()
    except KeyboardInterrupt:
        print("\n\nShutting down server...")
        server.stop()


if __name__ == "__main__":
    main()
