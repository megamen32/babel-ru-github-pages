---
Task ID: 1
Agent: main
Task: Implement prefix-based token codec architecture for Library of Babel

Work Log:
- Analyzed existing codebase: lib-tokens.js (PRNG generator), lib-core.js, lib-api.js, lib-fillers.js
- Identified core problem: current system is a "deterministic pseudo-text generator", not a true "curved library"
- Created js/lib-prefix-codec.js: canonical Huffman code builder, bit reader/writer
- Created js/lib-token-table.js: 10 token types, 8-state automaton, Zipf weights, Huffman tables per type and per state
- Created js/lib-address-codec.js: address→page decoder, text→address encoder, phrase search
- Created js/lib-coordinate-permutation.js: Feistel-like affine permutation for coordinate mixing
- Updated js/lib-core.js: decodePageByCoords now uses prefix codec (with PRNG fallback)
- Updated js/lib-api.js: added encodePhraseToCoords, classifyPageByText, honest search through encoding
- Updated index.html: added 4 new script tags before lib-tokens.js
- Created scripts/build_tokens.py: offline token dictionary builder
- Fixed RAW_CHAR bug: 21-bit code points could exceed Unicode range, reduced to 17-bit with validation
- Fixed bit alignment: encoder now left-pads to MSB so decoder reads encoded bits first
- All tests pass: encoding/decoding is reversible, search finds phrases honestly

Stage Summary:
- New architecture: address → bit stream → prefix code decoder → token stream → page
- Reverse: text → tokens → prefix codes → bit stream → address (honest encoding!)
- Language gravity: frequent tokens have short codes → small addresses → human-like text
- Coordinate permutation: adjacent coords → very different internal addresses
- Token dictionary: 10000 Russian words, 844 English words, 156 RU phrases, 68 EN phrases, 18 punct, 80 emoji, RAW_CHAR fallback
- Search is now honest: phrase → encode to address → that address actually contains the phrase
