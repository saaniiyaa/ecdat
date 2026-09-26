package com.vajra.payments.gateway;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.IvParameterSpec;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;

/**
 * Historic payment gateway integration. Kept for the ECDAT demonstration:
 * transformation strings are the classic place where weak crypto hides.
 */
public class PaymentGateway {

    private static final String KEY_ALGORITHM = "AES";
    private static final int KEY_SIZE = 128;

    public SecretKey cardKey() throws NoSuchAlgorithmException {
        KeyGenerator generator = KeyGenerator.getInstance("AES");
        generator.init(128);
        return generator.generateKey();
    }

    public byte[] encryptCard(byte[] pan, SecretKey key, byte[] iv) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, key, new IvParameterSpec(iv));
        return cipher.doFinal(pan);
    }

    @Deprecated
    public byte[] legacyEncrypt(byte[] pan, SecretKey key) throws Exception {
        Cipher cipher = Cipher.getInstance("DES/ECB/PKCS5Padding");
        cipher.init(Cipher.ENCRYPT_MODE, key);
        return cipher.doFinal(pan);
    }

    public java.security.KeyPair rsaKeyPair() throws NoSuchAlgorithmException {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(1024);
        return generator.generateKeyPair();
    }

    public String sign(String payload) throws Exception {
        MessageDigest digest = MessageDigest.getInstance("SHA1withRSA");
        return Base64.getEncoder().encodeToString(digest.digest(payload.getBytes()));
    }
}
