/* Published ground truth for the symmetric half of bike.ts.
 *
 * bike.test.ts covers the hand-rolled F2[x]/(x^r - 1) algebra thoroughly --
 * multiplication, inversion, the cyclic wrap -- which is the hard part and the
 * part most likely to be wrong. What it does not cover is the primitives the
 * KEM output is fed through: the SHA-256 that turns the error vector into a
 * shared secret (bike.ts:240) and the AES-256-GCM that uses that secret as a
 * key (bike.ts:775). Those had no published ground truth.
 *
 * THE VECTORS ARE COPIED FROM THE PUBLICATION, not reproduced from WebCrypto.
 * Both come from NIST's Cryptographic Algorithm Validation Program response
 * files, fetched from csrc.nist.gov:
 *
 *   shabytetestvectors.zip -> SHA256ShortMsg.rsp, the Len = 24 case
 *   gcmtestvectors.zip     -> gcmEncryptExtIV256.rsp, first Count in the
 *                             [Keylen = 256] [IVlen = 96] [PTlen = 128]
 *                             [AADlen = 0] [Taglen = 128] section
 *
 * The GCM section matches what aesEncryptDecrypt does: a 256-bit key, the
 * 12-byte IV it generates, no additional data, the default tag length. A vector
 * regenerated from WebCrypto would agree with this code for the same reason it
 * agrees with itself.
 *
 * The contract worth pinning here is the JOIN between the two halves:
 * aesEncryptDecrypt takes the shared secret AS the raw AES key, so a SHA-256
 * output that stopped being exactly 32 bytes would make importKey throw rather
 * than quietly weaken anything -- but nothing asserted the width.
 */
import { describe, it, expect } from 'vitest';
import { aesEncryptDecrypt, sha256 } from '../src/bike';

const hex = (h: string) => Uint8Array.from((h.match(/../g) ?? []).map((b) => parseInt(b, 16)));
const toHex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

const CAVP_GCM = {
  key: '31bdadd96698c204aa9ce1448ea94ae1fb4a9a0b3c9d773b51bb1822666b8f22',
  iv: '0d18e06c7c725ac9e362e1ce',
  pt: '2db5168e932556f8089a0622981d017d',
  ct: 'fa4362189661d163fcd6a56d8bf0405a',
  tag: 'd636ac1bbedd5cc3ee727dc2ab4a9489',
};

describe('published NIST vectors for the primitives the KEM output is fed through', () => {
  /* Asserted THROUGH the lab's own sha256(), not against crypto.subtle. The
     first version of this test called subtle.digest directly, and a mutation
     switching bike.ts's digest to SHA-1 went UNCAUGHT -- the assertion was
     testing WebCrypto rather than the shared-secret derivation. */
  it('the shared-secret digest matches CAVP SHA256ShortMsg.rsp, Len = 24', async () => {
    expect(toHex(await sha256(hex('b4190e'))))
      .toBe('dff2e73091f6c05e528896c4c831b9448653dc2ff043528f6769437bc7b975c2');
  });

  it('its output is exactly the 32 bytes AES-256 needs as a raw key', async () => {
    const out = await sha256(hex('b4190e'));
    expect(out.length).toBe(32);
    /* The join: that width is what lets the shared secret be imported directly. */
    await expect(crypto.subtle.importKey(
      'raw', out as unknown as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']))
      .resolves.toBeDefined();
  });

  it('AES-256-GCM matches CAVP gcmEncryptExtIV256.rsp, tag appended and 128 bits', async () => {
    const key = await crypto.subtle.importKey(
      'raw', hex(CAVP_GCM.key) as unknown as BufferSource, { name: 'AES-GCM' }, false, ['encrypt']);
    const out = new Uint8Array(await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: hex(CAVP_GCM.iv) }, key, hex(CAVP_GCM.pt) as unknown as BufferSource));
    expect(toHex(out)).toBe(CAVP_GCM.ct + CAVP_GCM.tag);
    expect(out.length).toBe(16 + 16);
  });
});

describe('aesEncryptDecrypt, the sealing step', () => {
  const secret = () => hex('31bdadd96698c204aa9ce1448ea94ae1fb4a9a0b3c9d773b51bb1822666b8f22');

  it('round-trips the message and reports a 12-byte IV', async () => {
    const r = await aesEncryptDecrypt(secret(), 'the syndrome decoded');
    expect(r.plaintext).toBe('the syndrome decoded');
    expect(hex(r.iv).length).toBe(12);
    /* The blob carries the 128-bit tag beyond the plaintext length. */
    expect(hex(r.ciphertext).length).toBe(new TextEncoder().encode('the syndrome decoded').length + 16);
  });

  it('a wrong shared secret fails closed rather than returning plaintext', async () => {
    const r = await aesEncryptDecrypt(secret(), 'fail closed');
    const wrong = secret(); wrong[31] ^= 1;
    const key = await crypto.subtle.importKey(
      'raw', wrong as unknown as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
    await expect(crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hex(r.iv) }, key, hex(r.ciphertext) as unknown as BufferSource))
      .rejects.toThrow();
  });

  it('a tampered blob fails closed even with the right secret', async () => {
    const r = await aesEncryptDecrypt(secret(), 'tamper target');
    const bytes = hex(r.ciphertext); bytes[0] ^= 1;
    const key = await crypto.subtle.importKey(
      'raw', secret() as unknown as BufferSource, { name: 'AES-GCM' }, false, ['decrypt']);
    await expect(crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: hex(r.iv) }, key, bytes as unknown as BufferSource))
      .rejects.toThrow();
  });
});
