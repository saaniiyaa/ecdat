using System;
using System.Security.Cryptography;
using System.Text;

namespace Vajra.Identity
{
    public class SessionSigner
    {
        private const int KeySize = 2048;

        public RSACryptoServiceProvider LegacyKey()
        {
            return new RSACryptoServiceProvider(KeySize);
        }

        public string ComputeOtp(string payload)
        {
            using (var sha1 = SHA1.Create())
            {
                var bytes = sha1.ComputeHash(Encoding.UTF8.GetBytes(payload));
                return BitConverter.ToString(bytes);
            }
        }

        public void SignXml(XmlDocument doc, string certPath)
        {
            var signedXml = new SignedXml(doc, new X509Certificate2(certPath));
            signedXml.ComputeSignature();
        }
    }
}
