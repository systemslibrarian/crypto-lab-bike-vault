(function(){const s=document.createElement("link").relList;if(s&&s.supports&&s.supports("modulepreload"))return;for(const o of document.querySelectorAll('link[rel="modulepreload"]'))n(o);new MutationObserver(o=>{for(const e of o)if(e.type==="childList")for(const r of e.addedNodes)r.tagName==="LINK"&&r.rel==="modulepreload"&&n(r)}).observe(document,{childList:!0,subtree:!0});function a(o){const e={};return o.integrity&&(e.integrity=o.integrity),o.referrerPolicy&&(e.referrerPolicy=o.referrerPolicy),o.crossOrigin==="use-credentials"?e.credentials="include":o.crossOrigin==="anonymous"?e.credentials="omit":e.credentials="same-origin",e}function n(o){if(o.ep)return;o.ep=!0;const e=a(o);fetch(o.href,e)}})();const h=587,D=14,C=13,U=7;function E(t){return new Uint8Array(t)}function H(t,s){const a=E(t),n=[],o=new Set;for(;n.length<s;){const e=new Uint8Array(4);crypto.getRandomValues(e);const r=((e[0]|e[1]<<8|e[2]<<16|(e[3]&127)<<24)>>>0)%t;o.has(r)||(o.add(r),n.push(r),a[r]=1)}return n.sort((e,r)=>e-r),{poly:a,positions:n}}function P(t,s,a){const n=E(a);for(let o=0;o<a;o++)if(t[o]!==0)for(let e=0;e<a;e++){if(s[e]===0)continue;const r=(o+e)%a;n[r]^=1}return n}function q(t,s){let a=new Uint8Array(s+1);a[0]=1,a[s]=1;let n=new Uint8Array(s+1);for(let p=0;p<s;p++)n[p]=t[p];let o=Array.from(a),e=Array.from(n),r=new Array(s+1).fill(0);r[0]=1;let i=new Array(s+1).fill(0),f=new Array(s+1).fill(0),g=new Array(s+1).fill(0);g[0]=1;function w(p){for(let m=p.length-1;m>=0;m--)if(p[m]!==0)return m;return-1}function d(p,m,c){for(let k=0;k<m.length;k++)m[k]!==0&&k+c<p.length&&(p[k+c]^=1)}for(;;){const p=w(e);if(p<0)return null;if(p===0)break;const m=w(o);if(m<p){[o,e]=[e,o],[r,i]=[i,r],[f,g]=[g,f];continue}const c=m-p;d(o,e,c),d(r,i,c),d(f,g,c)}const l=E(s);for(let p=0;p<s;p++)l[p]=g[p]&1;const y=P(t,l,s);if(y[0]!==1)return null;for(let p=1;p<s;p++)if(y[p]!==0)return null;return l}function A(t){const s=Math.ceil(t.length/8),a=new Uint8Array(s);for(let n=0;n<t.length;n++)t[n]&&(a[n>>3]|=1<<(n&7));return a}function G(t){const s=[];for(let a=0;a<t.length;a++)t[a]&&s.push(a);return s}function M(t){return Array.from(t).map(s=>s.toString(16).padStart(2,"0")).join("")}async function j(t){const s=await crypto.subtle.digest("SHA-256",t);return new Uint8Array(s)}async function F(){const t=performance.now(),{poly:s,positions:a}=H(h,U),{poly:n,positions:o}=H(h,U),e=q(s,h);if(!e)return F();const r=P(e,n,h),i=performance.now()-t;return{publicKey:A(r),privateH0:A(s),privateH1:A(n),h0Positions:a,h1Positions:o,hPositions:G(r),timingMs:i}}async function z(t){const s=performance.now(),a=E(h);for(let v=0;v<h;v++)a[v]=t[v>>3]>>(v&7)&1;const n=Math.ceil(C/2),o=C-n,{poly:e,positions:r}=H(h,n),{poly:i,positions:f}=H(h,o),g=P(i,a,h),w=E(h);for(let v=0;v<h;v++)w[v]=e[v]^g[v];const d=i,l=new Uint8Array(h*2);l.set(e,0),l.set(i,h);const y=await j(l),p=A(w),m=A(d),c=[...r.map(v=>v),...f.map(v=>v+h)],k=performance.now()-s;return{ciphertext:new Uint8Array([...p,...m]),sharedSecret:y,errorPositions:c,c0Hex:M(p),c1Hex:M(m),timingMs:k}}function N(t,s,a,n,o=10){const e=new Uint8Array(t),r=E(n),i=E(n),f=[],g=[];for(let l=0;l<n;l++)s[l]&&f.push(l),a[l]&&g.push(l);let w=0;for(let l=0;l<o;l++){w++;let y=!0;for(let u=0;u<n;u++)if(e[u]){y=!1;break}if(y)return{e0:r,e1:i,iterations:w-1,success:!0};const p=new Int32Array(n),m=new Int32Array(n);for(let u=0;u<n;u++){let x=0;for(const T of f)e[(u+T)%n]&&x++;p[u]=x}for(let u=0;u<n;u++){let x=0;for(const T of g)e[(u+T)%n]&&x++;m[u]=x}let c=0;for(let u=0;u<n;u++)p[u]>c&&(c=p[u]),m[u]>c&&(c=m[u]);const k=Math.max(Math.ceil(c*.75),1),v=Math.max(Math.ceil(c*.55),1),R=l===0?k:v;let K=!1;for(let u=0;u<n;u++)if(p[u]>=R){r[u]^=1;for(const x of f)e[(u+x)%n]^=1;K=!0}for(let u=0;u<n;u++)if(m[u]>=R){i[u]^=1;for(const x of g)e[(u+x)%n]^=1;K=!0}if(!K)break}let d=!0;for(let l=0;l<n;l++)if(e[l]){d=!1;break}return{e0:r,e1:i,iterations:w,success:d}}async function V(t,s,a){const n=performance.now(),o=Math.ceil(h/8),e=E(h),r=E(h);for(let c=0;c<h;c++)e[c]=t[c>>3]>>(c&7)&1,r[c]=t[o+(c>>3)]>>(c&7)&1;const i=E(h),f=E(h);for(let c=0;c<h;c++)i[c]=s[c>>3]>>(c&7)&1,f[c]=a[c>>3]>>(c&7)&1;const g=P(e,i,h),w=P(r,f,h),d=E(h);for(let c=0;c<h;c++)d[c]=g[c]^w[c];const l=N(d,i,f,h),y=new Uint8Array(h*2);y.set(l.e0,0),y.set(l.e1,h);const p=await j(y),m=performance.now()-n;return{sharedSecret:p,recoveredError:[...G(l.e0),...G(l.e1).map(c=>c+h)],decoderIterations:l.iterations,success:l.success,timingMs:m}}async function W(t,s){const a=await crypto.subtle.importKey("raw",t,{name:"AES-GCM"},!1,["encrypt","decrypt"]),n=crypto.getRandomValues(new Uint8Array(12)),o=new TextEncoder,e=new TextDecoder,r=await crypto.subtle.encrypt({name:"AES-GCM",iv:n},a,o.encode(s)),i=await crypto.subtle.decrypt({name:"AES-GCM",iv:n},a,r);return{ciphertext:M(new Uint8Array(r)),iv:M(n),plaintext:e.decode(i)}}const $=[[1,1,1,0,1,0,0],[1,1,0,1,0,1,0],[1,0,1,1,0,0,1]],Q=[[1,0,0,0,1,1,1],[0,1,0,0,1,1,0],[0,0,1,0,1,0,1],[0,0,0,1,0,1,1]];function Z(t){if(t.length!==4||t.some(d=>d!==0&&d!==1))throw new Error("Message must be exactly 4 binary digits");const s=new Array(7).fill(0);for(let d=0;d<7;d++){let l=0;for(let y=0;y<4;y++)l^=t[y]&Q[y][d];s[d]=l}const a=new Uint8Array(1);crypto.getRandomValues(a);const n=a[0]%7,o=[...s];o[n]^=1;const e=new Array(3).fill(0);for(let d=0;d<3;d++){let l=0;for(let y=0;y<7;y++)l^=$[d][y]&o[y];e[d]=l}const r=e[0]*4+e[1]*2+e[2];let i=-1;for(let d=0;d<7;d++)if($[0][d]*4+$[1][d]*2+$[2][d]===r){i=d;break}const f=[...o];i>=0&&(f[i]^=1);const g=f.slice(0,4),w=g.every((d,l)=>d===t[l]);return{message:t,encoded:s,withError:o,errorPosition:n,syndrome:e,corrected:f,decodedMessage:g,success:w}}function J(t){const s=(n,o)=>n.map((e,r)=>`<span class="bit ${r===o?"bit-error":""}" aria-label="bit ${r}: ${e}">${e}</span>`).join(""),a=t.success?'<span class="success-text" role="status">✓ Corrected successfully</span>':'<span class="error-text" role="status">✗ Correction failed</span>';return`
    <div class="parity-steps">
      <div class="step">
        <span class="step-label">Message (4 bits):</span>
        <span class="step-bits mono">${s(t.message)}</span>
      </div>
      <div class="step">
        <span class="step-label">Encoded (7 bits):</span>
        <span class="step-bits mono">${s(t.encoded)}</span>
      </div>
      <div class="step">
        <span class="step-label">With 1-bit error at position ${t.errorPosition}:</span>
        <span class="step-bits mono">${s(t.withError,t.errorPosition)}</span>
      </div>
      <div class="step">
        <span class="step-label">Syndrome (H × received):</span>
        <span class="step-bits mono">${s(t.syndrome)}</span>
      </div>
      <div class="step">
        <span class="step-label">Corrected:</span>
        <span class="step-bits mono">${s(t.corrected)}</span>
        ${a}
      </div>
      <div class="step">
        <span class="step-label">Decoded message:</span>
        <span class="step-bits mono">${s(t.decodedMessage)}</span>
      </div>
    </div>
  `}const _=[{name:"BIKE-1",level:1,pkBytes:1541,ctBytes:1573,ssBytes:32,assumption:"QC-MDPC Decoding",nistStatus:"Round 4 Alternate",family:"bike"},{name:"ML-KEM-512",level:1,pkBytes:800,ctBytes:768,ssBytes:32,assumption:"Module-LWE",nistStatus:"FIPS 203 Standard",family:"mlkem"},{name:"BIKE-3",level:3,pkBytes:3083,ctBytes:3115,ssBytes:32,assumption:"QC-MDPC Decoding",nistStatus:"Round 4 Alternate",family:"bike"},{name:"ML-KEM-768",level:3,pkBytes:1184,ctBytes:1088,ssBytes:32,assumption:"Module-LWE",nistStatus:"FIPS 203 Standard",family:"mlkem"},{name:"BIKE-5",level:5,pkBytes:5122,ctBytes:5154,ssBytes:32,assumption:"QC-MDPC Decoding",nistStatus:"Round 4 Alternate",family:"bike"},{name:"ML-KEM-1024",level:5,pkBytes:1568,ctBytes:1568,ssBytes:32,assumption:"Module-LWE",nistStatus:"FIPS 203 Standard",family:"mlkem"}];function X(t){const s=[1,3,5],a=Math.max(..._.map(o=>o.pkBytes+o.ctBytes));let n='<div class="compare-chart" role="table" aria-label="Bar chart: public key plus ciphertext sizes">';n+='<div class="chart-header" role="row"><span role="columnheader">Scheme</span><span role="columnheader">PK + CT Size</span></div>';for(const o of s){const e=_.filter(r=>r.level===o);n+=`<div class="chart-level-label" role="rowgroup" aria-label="Security Level ${o}">Level ${o}</div>`;for(const r of e){const i=r.pkBytes+r.ctBytes,f=i/a*100,g=r.family==="bike"?"bar-bike":"bar-mlkem";n+=`
        <div class="chart-row" role="row">
          <span class="chart-label" role="rowheader">${r.name}</span>
          <div class="chart-bar-container">
            <div class="chart-bar ${g}" style="width:${f.toFixed(1)}%;" role="cell" aria-label="${r.name}: ${i.toLocaleString()} bytes total">
              <span class="chart-bar-value">${i.toLocaleString()} B</span>
            </div>
          </div>
        </div>`}}n+="</div>",n+='<div class="chart-legend" aria-label="Chart legend">',n+='<span class="legend-item"><span class="legend-swatch bar-bike" aria-hidden="true"></span> BIKE (code-based)</span>',n+='<span class="legend-item"><span class="legend-swatch bar-mlkem" aria-hidden="true"></span> ML-KEM (lattice-based)</span>',n+="</div>",t.innerHTML=n}function Y(){const t=document.querySelectorAll(".panel-tab"),s=document.querySelectorAll(".panel");function a(o){t.forEach(r=>{const i=r.dataset.panel===o;r.classList.toggle("active",i),r.setAttribute("aria-selected",String(i)),r.setAttribute("tabindex",i?"0":"-1")}),s.forEach(r=>{const i=r.id===o;r.classList.toggle("active",i),r.hidden=!i});const e=document.getElementById(o);e&&e.scrollIntoView({behavior:"smooth",block:"start"})}t.forEach(o=>{o.addEventListener("click",()=>{const e=o.dataset.panel;e&&a(e)})});const n=Array.from(t);t.forEach((o,e)=>{o.addEventListener("keydown",r=>{let i=e;if(r.key==="ArrowRight"||r.key==="ArrowDown"?(r.preventDefault(),i=(e+1)%n.length):r.key==="ArrowLeft"||r.key==="ArrowUp"?(r.preventDefault(),i=(e-1+n.length)%n.length):r.key==="Home"?(r.preventDefault(),i=0):r.key==="End"&&(r.preventDefault(),i=n.length-1),i!==e){n[i].focus();const f=n[i].dataset.panel;f&&a(f)}})}),document.querySelectorAll(".next-panel-btn, .link-btn").forEach(o=>{o.addEventListener("click",()=>{const e=o.dataset.next;e&&a(e)})}),t.forEach((o,e)=>{o.setAttribute("tabindex",e===0?"0":"-1")})}function ee(){const t=document.getElementById("theme-toggle"),s=t.querySelector(".theme-icon"),a=document.documentElement,n=localStorage.getItem("theme");n==="light"||!n&&window.matchMedia("(prefers-color-scheme: light)").matches?(a.dataset.theme="light",t.setAttribute("aria-label","Switch to dark mode"),s.textContent="☀️"):n==="dark"&&(a.dataset.theme="dark"),t.addEventListener("click",()=>{const o=a.dataset.theme==="light";a.dataset.theme=o?"dark":"light",t.setAttribute("aria-label",o?"Switch to light mode":"Switch to dark mode"),s.textContent=o?"🌙":"☀️",localStorage.setItem("theme",a.dataset.theme)})}let S=null,B=null,O=null;function b(t){return document.getElementById(t)}function L(t){const s=document.createElement("div");return s.textContent=t,s.innerHTML}function I(t,s=64){return t.length<=s?t:t.slice(0,s)+"…"}function te(){const t=b("parity-encode-btn"),s=b("parity-input"),a=b("parity-output"),n=()=>{const o=s.value.trim();if(!/^[01]{4}$/.test(o)){a.innerHTML='<p class="error-text" role="alert">Please enter exactly 4 binary digits (0 or 1).</p>';return}const e=o.split("").map(Number),r=Z(e);a.innerHTML=J(r)};t.addEventListener("click",n),s.addEventListener("keydown",o=>{o.key==="Enter"&&n()})}function se(){const t=b("keygen-btn"),s=b("keygen-output");t.addEventListener("click",async()=>{t.disabled=!0,t.textContent="Generating…",s.innerHTML='<p class="loading-text">Generating BIKE-1 keypair (simulation: r='+h+", w="+D+", t="+C+")…</p>";try{const a=await F();S=a,s.innerHTML=`
        <div class="output-section">
          <div class="status-chip-row">
            <span class="status-chip status-sim">⚠ Illustrative — not production BIKE</span>
          </div>
          <h4>Private Key (h₀ positions)</h4>
          <p class="mono output-scroll" aria-label="Private key h0 non-zero positions">[${a.h0Positions.join(", ")}]</p>
          <p class="meta">Weight: ${a.h0Positions.length} (target: ${D/2})</p>

          <h4>Private Key (h₁ positions)</h4>
          <p class="mono output-scroll" aria-label="Private key h1 non-zero positions">[${a.h1Positions.join(", ")}]</p>
          <p class="meta">Weight: ${a.h1Positions.length} (target: ${D/2})</p>

          <h4>Public Key h = h₀⁻¹ · h₁</h4>
          <p class="mono output-scroll" aria-label="Public key hex">${I(M(a.publicKey),80)}</p>
          <p class="meta">Size: ${a.publicKey.length} bytes (simulation) | Real BIKE-1: 1,541 bytes</p>
          <p class="meta">Non-zero positions: ${a.hPositions.length} of ${h}</p>

          <p class="meta timing">⏱ Generated in ${a.timingMs.toFixed(1)} ms</p>
        </div>
      `,ne()}catch(a){s.innerHTML=`<p class="error-text" role="alert">Key generation failed: ${L(String(a))}</p>`}finally{t.disabled=!1,t.textContent="Generate Keypair"}})}function ne(){const t=b("encap-prereq"),s=b("encap-controls");S?(t.style.display="none",s.style.display="block"):(t.style.display="block",s.style.display="none")}function oe(){const t=b("encap-btn"),s=b("decap-btn"),a=b("encap-output"),n=b("decap-output"),o=b("kem-match");t.addEventListener("click",async()=>{if(S){t.disabled=!0,t.textContent="Encapsulating…",a.innerHTML='<p class="loading-text">Generating error vector and computing ciphertext…</p>',n.innerHTML="",o.style.display="none";try{const e=await z(S.publicKey);B=e,a.innerHTML=`
        <div class="output-section">
          <h4>Ciphertext c₀</h4>
          <p class="mono output-scroll" aria-label="Ciphertext c0 hex">${I(e.c0Hex,80)}</p>

          <h4>Ciphertext c₁</h4>
          <p class="mono output-scroll" aria-label="Ciphertext c1 hex">${I(e.c1Hex,80)}</p>

          <h4>Alice's Shared Secret K</h4>
          <p class="mono output-scroll shared-secret" aria-label="Alice's shared secret hex">${M(e.sharedSecret)}</p>

          <p class="meta">Error vector weight: ${e.errorPositions.length} (target: ${C})</p>
          <p class="meta">Total ciphertext: ${e.ciphertext.length} bytes (simulation) | Real BIKE-1: 1,573 bytes</p>
          <p class="meta timing">⏱ Encapsulated in ${e.timingMs.toFixed(1)} ms</p>
        </div>
      `,s.disabled=!1}catch(e){a.innerHTML=`<p class="error-text" role="alert">Encapsulation failed: ${L(String(e))}</p>`}finally{t.disabled=!1,t.textContent="Encapsulate (Alice)"}}}),s.addEventListener("click",async()=>{if(!(!S||!B)){s.disabled=!0,s.textContent="Decapsulating…",n.innerHTML='<p class="loading-text">Running Black-Gray-Flip decoder…</p>';try{const e=await V(B.ciphertext,S.privateH0,S.privateH1),r=M(B.sharedSecret),i=M(e.sharedSecret),f=r===i;n.innerHTML=`
        <div class="output-section">
          <h4>Bob's Shared Secret K</h4>
          <p class="mono output-scroll shared-secret" aria-label="Bob's shared secret hex">${i}</p>

          <p class="meta">BGF decoder iterations: ${e.decoderIterations}</p>
          <p class="meta">Decoder ${e.success?"converged ✓":"did NOT converge ✗"}</p>
          <p class="meta">Recovered error positions: ${e.recoveredError.length}</p>
          <p class="meta timing">⏱ Decapsulated in ${e.timingMs.toFixed(1)} ms</p>
        </div>
      `,o.style.display="block",f&&e.success?(o.innerHTML=`
          <div class="match-success" role="status">
            <span class="match-icon" aria-hidden="true">✅</span>
            <span><strong>Shared secrets match!</strong> K<sub>Alice</sub> = K<sub>Bob</sub></span>
          </div>
        `,O=e.sharedSecret,ae()):o.innerHTML=`
          <div class="match-failure" role="alert">
            <span class="match-icon" aria-hidden="true">❌</span>
            <span><strong>Shared secrets do NOT match.</strong> This demonstrates BIKE's non-zero decapsulation failure rate. Try again — failures are rare but possible.</span>
          </div>
        `}catch(e){n.innerHTML=`<p class="error-text" role="alert">Decapsulation failed: ${L(String(e))}</p>`}finally{s.disabled=!0,s.textContent="Decapsulate (Bob)"}}})}function ae(){const t=b("aes-prereq"),s=b("aes-section");t.style.display="none",s.style.display="block"}function re(){const t=b("aes-encrypt-btn"),s=b("aes-plaintext"),a=b("aes-output");b("aes-prereq").style.display="block",b("aes-section").style.display="none";const n=async()=>{if(!O)return;const o=s.value.trim();if(!o){a.innerHTML='<p class="error-text" role="alert">Please enter a message to encrypt.</p>';return}t.disabled=!0,t.textContent="Encrypting…";try{const e=await W(O,o);a.innerHTML=`
        <div class="output-section">
          <h4>AES-256-GCM Encryption</h4>
          <p class="meta">IV (nonce):</p>
          <p class="mono output-scroll" aria-label="AES initialization vector">${e.iv}</p>
          <p class="meta">Ciphertext:</p>
          <p class="mono output-scroll" aria-label="AES ciphertext hex">${I(e.ciphertext,120)}</p>

          <h4>Decrypted</h4>
          <p class="decrypted-text" aria-label="Decrypted plaintext">"${L(e.plaintext)}"</p>

          <p class="meta">End-to-end: BIKE KEM → shared secret → AES-256-GCM → plaintext ✓</p>
        </div>
      `}catch(e){a.innerHTML=`<p class="error-text" role="alert">Encryption failed: ${L(String(e))}</p>`}finally{t.disabled=!1,t.textContent="Encrypt"}};t.addEventListener("click",n),s.addEventListener("keydown",o=>{o.key==="Enter"&&n()})}function ie(){const t=b("compare-chart");t&&X(t)}document.addEventListener("DOMContentLoaded",()=>{ee(),Y(),te(),se(),oe(),re(),ie()});
//# sourceMappingURL=index-ZDUtbr1N.js.map
