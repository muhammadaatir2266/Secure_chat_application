import { useRef } from 'react';

export function useCrypto() {
  const dhPrivateKey = useRef<CryptoKey | null>(null);
  const dhPublicKey = useRef<CryptoKey | null>(null);
  const publicKeyPem = useRef<string>('');
  const sharedSecret = useRef<CryptoKey | null>(null);
  const sharedSecretRaw = useRef<ArrayBuffer | null>(null);

  // Initialize Diffie-Hellman key pair
  const initDH = async () => {
    try {
      // Generate ECDH key pair (P-256 curve)
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: 'ECDH',
          namedCurve: 'P-256'
        },
        true,
        ['deriveKey', 'deriveBits']
      );

      dhPrivateKey.current = keyPair.privateKey;
      dhPublicKey.current = keyPair.publicKey;

      // Export public key to send to peer
      const exported = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const pem = arrayBufferToPem(exported, 'PUBLIC KEY');
      publicKeyPem.current = pem;
      
      console.log('DH initialized with keys:', {
        hasPrivate: !!dhPrivateKey.current,
        hasPublic: !!dhPublicKey.current
      });
      
      return pem;
    } catch (error) {
      console.error('DH init error:', error);
      throw error;
    }
  };

  // Compute shared secret from peer's public key
  const computeSharedSecret = async (peerPublicKeyPem: string) => {
    if (!dhPrivateKey.current) {
      console.error('DH not initialized - private key missing');
      throw new Error('DH not initialized');
    }

    try {
      // Import peer's public key
      const peerKeyData = pemToArrayBuffer(peerPublicKeyPem);
      const peerPublicKey = await window.crypto.subtle.importKey(
        'spki',
        peerKeyData,
        {
          name: 'ECDH',
          namedCurve: 'P-256'
        },
        false,
        []
      );

      // Derive shared secret
      const sharedSecretBits = await window.crypto.subtle.deriveBits(
        {
          name: 'ECDH',
          public: peerPublicKey
        },
        dhPrivateKey.current,
        256
      );

      sharedSecretRaw.current = sharedSecretBits;

      // Derive AES-GCM key from shared secret using HKDF
      const salt = new Uint8Array(32);
      const info = new TextEncoder().encode('secure-chat-key-derivation');

      // Import shared secret as key material
      const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        sharedSecretBits,
        { name: 'HKDF' },
        false,
        ['deriveKey']
      );

      // Derive AES-GCM key
      const aesKey = await window.crypto.subtle.deriveKey(
        {
          name: 'HKDF',
          hash: 'SHA-256',
          salt: salt,
          info: info
        },
        keyMaterial,
        {
          name: 'AES-GCM',
          length: 256
        },
        false,
        ['encrypt', 'decrypt']
      );

      sharedSecret.current = aesKey;
      console.log('Shared secret computed successfully');
      return aesKey;
    } catch (error) {
      console.error('Shared secret computation error:', error);
      throw error;
    }
  };

  // Encrypt message with AES-256-GCM
  const encrypt = async (plaintext: string): Promise<{ nonce: string; ciphertext: string }> => {
    if (!sharedSecret.current) throw new Error('Shared secret not established');

    try {
      // Generate random nonce (12 bytes for GCM)
      const nonce = window.crypto.getRandomValues(new Uint8Array(12));
      
      // Encrypt
      const encoder = new TextEncoder();
      const data = encoder.encode(plaintext);
      
      const ciphertext = await window.crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: nonce
        },
        sharedSecret.current,
        data
      );

      // Convert to hex
      return {
        nonce: arrayBufferToHex(nonce),
        ciphertext: arrayBufferToHex(ciphertext)
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw error;
    }
  };

  // Decrypt message
  const decrypt = async (nonceHex: string, ciphertextHex: string): Promise<string> => {
    if (!sharedSecret.current) throw new Error('Shared secret not established');

    try {
      const nonce = hexToArrayBuffer(nonceHex);
      const ciphertext = hexToArrayBuffer(ciphertextHex);

      const plaintext = await window.crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: new Uint8Array(nonce)
        },
        sharedSecret.current,
        new Uint8Array(ciphertext)
      );

      const decoder = new TextDecoder();
      return decoder.decode(plaintext);
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Decryption failed - message may be tampered');
    }
  };

  // Get public key for transmission
  const getPublicKey = (): string => {
    return publicKeyPem.current;
  };

  // Get shared secret hash for verification
  const getSharedSecretHash = (): string => {
    if (!sharedSecretRaw.current) return 'Not established';
    return arrayBufferToHex(sharedSecretRaw.current).substring(0, 64);
  };

  return {
    initDH,
    computeSharedSecret,
    encrypt,
    decrypt,
    getPublicKey,
    getSharedSecretHash
  };
}

// Helper functions
function arrayBufferToPem(buffer: ArrayBuffer, label: string): string {
  const bytes = new Uint8Array(buffer);
  const binary = Array.from(bytes, byte => String.fromCharCode(byte)).join('');
  const base64 = btoa(binary);
  const formatted = base64.match(/.{1,64}/g)?.join('\n') || base64;
  return `-----BEGIN ${label}-----\n${formatted}\n-----END ${label}-----`;
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const base64 = pem
    .replace(/-----BEGIN .*-----/, '')
    .replace(/-----END .*-----/, '')
    .replace(/\s/g, '');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function arrayBufferToHex(buffer: ArrayBuffer | Uint8Array): string {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

function hexToArrayBuffer(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substr(i, 2), 16);
  }
  return bytes;
}
