"""
Cryptographic utilities for secure chat application.
Implements Diffie-Hellman key exchange and AES-256-GCM encryption.
"""

import os
import hashlib
from typing import Tuple, Dict
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.asymmetric import dh
from cryptography.hazmat.primitives import serialization, hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.backends import default_backend


# RFC 3526 2048-bit MODP Group 14 (pre-agreed parameters)
# This is a standard, publicly known set of parameters
RFC3526_2048_BIT_MODP_GROUP_P = int(
    "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1"
    "29024E088A67CC74020BBEA63B139B22514A08798E3404DD"
    "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245"
    "E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED"
    "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D"
    "C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F"
    "83655D23DCA3AD961C62F356208552BB9ED529077096966D"
    "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B"
    "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9"
    "DE2BCBF6955817183995497CEA956AE515D2261898FA0510"
    "15728E5A8AACAA68FFFFFFFFFFFFFFFF", 16
)
RFC3526_2048_BIT_MODP_GROUP_G = 2


def get_shared_dh_parameters():
    """
    Get pre-agreed DH parameters (RFC 3526 2048-bit MODP Group 14).
    All clients use the same parameters.
    """
    p = RFC3526_2048_BIT_MODP_GROUP_P
    g = RFC3526_2048_BIT_MODP_GROUP_G
    
    params = dh.DHParameterNumbers(p, g).parameters(default_backend())
    return params


class DiffieHellmanKeyExchange:
    """
    Implements Diffie-Hellman key exchange for establishing shared secrets.
    Uses RFC 3526 2048-bit MODP Group 14 for secure parameters.
    """
    
    def __init__(self):
        """Initialize DH parameters and generate private/public key pair."""
        # Use RFC 3526 2048-bit MODP Group 14 (standard parameters)
        self.parameters = get_shared_dh_parameters()
        self.private_key = self.parameters.generate_private_key()
        self.public_key = self.private_key.public_key()
        self.shared_secret = None
        
    def get_public_key_bytes(self) -> bytes:
        """
        Serialize public key for transmission over network.
        
        Returns:
            bytes: PEM-encoded public key
        """
        return self.public_key.public_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PublicFormat.SubjectPublicKeyInfo
        )
    
    def compute_shared_secret(self, peer_public_key_bytes: bytes) -> bytes:
        """
        Compute shared secret using peer's public key.
        
        Args:
            peer_public_key_bytes: PEM-encoded peer public key
            
        Returns:
            bytes: 32-byte AES key derived from shared secret
        """
        # Deserialize peer's public key
        peer_public_key = serialization.load_pem_public_key(peer_public_key_bytes)
        
        # Compute raw shared secret
        raw_shared_secret = self.private_key.exchange(peer_public_key)
        
        # Derive a 32-byte key using HKDF-SHA256
        derived_key = HKDF(
            algorithm=hashes.SHA256(),
            length=32,
            salt=None,
            info=b'secure-chat-key-derivation',
        ).derive(raw_shared_secret)
        
        self.shared_secret = derived_key
        return derived_key
    
    def get_shared_secret_hash(self) -> str:
        """
        Get SHA-256 hash of shared secret for verification (not the secret itself).
        
        Returns:
            str: Hexadecimal hash of shared secret
        """
        if self.shared_secret is None:
            return "Not established"
        return hashlib.sha256(self.shared_secret).hexdigest()


class AESCipher:
    """
    Implements AES-256-GCM encryption for message confidentiality and integrity.
    """
    
    def __init__(self, key: bytes):
        """
        Initialize AES-GCM cipher with 256-bit key.
        
        Args:
            key: 32-byte encryption key
        """
        if len(key) != 32:
            raise ValueError("AES-256 requires a 32-byte key")
        self.cipher = AESGCM(key)
    
    def encrypt(self, plaintext: str) -> Dict[str, bytes]:
        """
        Encrypt plaintext message using AES-256-GCM.
        
        Args:
            plaintext: Message to encrypt
            
        Returns:
            dict: Contains 'nonce' and 'ciphertext' (includes auth tag)
        """
        # Generate random 12-byte nonce (96 bits recommended for GCM)
        nonce = os.urandom(12)
        
        # Encrypt and authenticate
        plaintext_bytes = plaintext.encode('utf-8')
        ciphertext = self.cipher.encrypt(nonce, plaintext_bytes, None)
        
        return {
            'nonce': nonce,
            'ciphertext': ciphertext  # Includes 16-byte authentication tag
        }
    
    def decrypt(self, nonce: bytes, ciphertext: bytes) -> str:
        """
        Decrypt ciphertext and verify authentication tag.
        
        Args:
            nonce: 12-byte nonce used during encryption
            ciphertext: Encrypted message with authentication tag
            
        Returns:
            str: Decrypted plaintext message
            
        Raises:
            Exception: If authentication fails (tampering detected)
        """
        try:
            plaintext_bytes = self.cipher.decrypt(nonce, ciphertext, None)
            return plaintext_bytes.decode('utf-8')
        except Exception as e:
            raise Exception(f"Decryption failed - message may be tampered: {e}")


def hash_message(message: str) -> str:
    """
    Compute SHA-256 hash of a message.
    
    Args:
        message: Input message
        
    Returns:
        str: Hexadecimal hash
    """
    return hashlib.sha256(message.encode('utf-8')).hexdigest()
