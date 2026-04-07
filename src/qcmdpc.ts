/**
 * qcmdpc.ts — QC-MDPC visualization helpers and parity check demo
 */

/** Simple [7,4] Hamming code parity check matrix for the primer demo */
const H_HAMMING = [
  [1, 1, 1, 0, 1, 0, 0],
  [1, 1, 0, 1, 0, 1, 0],
  [1, 0, 1, 1, 0, 0, 1],
];

/** Generator matrix for [7,4] Hamming code (systematic form) */
const G_HAMMING = [
  [1, 0, 0, 0, 1, 1, 1],
  [0, 1, 0, 0, 1, 1, 0],
  [0, 0, 1, 0, 1, 0, 1],
  [0, 0, 0, 1, 0, 1, 1],
];

export interface ParityResult {
  message: number[];
  encoded: number[];
  withError: number[];
  errorPosition: number;
  syndrome: number[];
  corrected: number[];
  decodedMessage: number[];
  success: boolean;
}

/** Encode a 4-bit message using [7,4] Hamming code, introduce 1-bit error, correct */
export function parityDemo(messageBits: number[]): ParityResult {
  if (messageBits.length !== 4 || messageBits.some(b => b !== 0 && b !== 1)) {
    throw new Error('Message must be exactly 4 binary digits');
  }

  // Encode: codeword = message × G (mod 2)
  const encoded: number[] = new Array(7).fill(0);
  for (let j = 0; j < 7; j++) {
    let sum = 0;
    for (let i = 0; i < 4; i++) {
      sum ^= messageBits[i] & G_HAMMING[i][j];
    }
    encoded[j] = sum;
  }

  // Introduce a random 1-bit error
  const buf = new Uint8Array(1);
  crypto.getRandomValues(buf);
  const errorPosition = buf[0] % 7;
  const withError = [...encoded];
  withError[errorPosition] ^= 1;

  // Compute syndrome: s = H × received (mod 2)
  const syndrome: number[] = new Array(3).fill(0);
  for (let i = 0; i < 3; i++) {
    let sum = 0;
    for (let j = 0; j < 7; j++) {
      sum ^= H_HAMMING[i][j] & withError[j];
    }
    syndrome[i] = sum;
  }

  // Look up which column of H matches the syndrome
  const syndromeVal = syndrome[0] * 4 + syndrome[1] * 2 + syndrome[2];
  let errorIdx = -1;
  for (let col = 0; col < 7; col++) {
    const colVal = H_HAMMING[0][col] * 4 + H_HAMMING[1][col] * 2 + H_HAMMING[2][col];
    if (colVal === syndromeVal) {
      errorIdx = col;
      break;
    }
  }

  // Correct
  const corrected = [...withError];
  if (errorIdx >= 0) {
    corrected[errorIdx] ^= 1;
  }

  // Extract message (first 4 bits in systematic encoding)
  const decodedMessage = corrected.slice(0, 4);

  const success = decodedMessage.every((b, i) => b === messageBits[i]);

  return {
    message: messageBits,
    encoded,
    withError,
    errorPosition,
    syndrome,
    corrected,
    decodedMessage,
    success,
  };
}

/** Render the parity demo output as HTML */
export function renderParityOutput(result: ParityResult): string {
  const mark = (bits: number[], highlightIdx?: number) =>
    bits
      .map((b, i) => {
        const cls = i === highlightIdx ? 'bit-error' : '';
        return `<span class="bit ${cls}" aria-label="bit ${i}: ${b}">${b}</span>`;
      })
      .join('');

  const successText = result.success
    ? '<span class="success-text" role="status">✓ Corrected successfully</span>'
    : '<span class="error-text" role="status">✗ Correction failed</span>';

  return `
    <div class="parity-steps">
      <div class="step">
        <span class="step-label">Message (4 bits):</span>
        <span class="step-bits mono">${mark(result.message)}</span>
      </div>
      <div class="step">
        <span class="step-label">Encoded (7 bits):</span>
        <span class="step-bits mono">${mark(result.encoded)}</span>
      </div>
      <div class="step">
        <span class="step-label">With 1-bit error at position ${result.errorPosition}:</span>
        <span class="step-bits mono">${mark(result.withError, result.errorPosition)}</span>
      </div>
      <div class="step">
        <span class="step-label">Syndrome (H × received):</span>
        <span class="step-bits mono">${mark(result.syndrome)}</span>
      </div>
      <div class="step">
        <span class="step-label">Corrected:</span>
        <span class="step-bits mono">${mark(result.corrected)}</span>
        ${successText}
      </div>
      <div class="step">
        <span class="step-label">Decoded message:</span>
        <span class="step-bits mono">${mark(result.decodedMessage)}</span>
      </div>
    </div>
  `;
}
