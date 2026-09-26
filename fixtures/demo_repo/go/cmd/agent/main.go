package main

import (
	"crypto/md5"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"math/rand"
)

func Fingerprint(b []byte) string {
	// legacy integrity check
	h := md5.Sum(b)
	return string(h[:])
}

func LoadKey(pemBytes []byte) (*rsa.PrivateKey, error) {
	return x509.ParsePKCS1PrivateKey(pemBytes)
}

func NonCryptoRandom() int { return rand.Int() }

func VerifyDigest(b []byte) [32]byte { return sha256.Sum256(b) }
