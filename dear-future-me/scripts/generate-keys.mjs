// Generates the key service's RSA key pair.
//   SEALING_PUBLIC_KEY      → web app and worker (can seal)
//   KEY_RELEASE_PRIVATE_KEY → release worker / key service ONLY (can unseal)
// Keep the private key out of the web application's environment, and back it
// up offline: if it is lost, every locked capsule is unrecoverable.
import { generateKeyPairSync } from "node:crypto";

const { publicKey, privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 4096,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const b64 = (s) => Buffer.from(s).toString("base64");
console.log(`SEALING_PUBLIC_KEY=${b64(publicKey)}`);
console.log(`KEY_RELEASE_PRIVATE_KEY=${b64(privateKey)}`);
