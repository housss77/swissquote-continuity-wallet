# Safe passkeys tutorial

The passkey creation and Safe4337Pack flow are adapted from
https://github.com/5afe/safe-passkeys-tutorial at commit
44cbe73918f13ee7b435d7ab447404a3fa5d6a18.

MIT License

Copyright (c) 2024-2025 Safe Ecosystem Foundation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.

# Candide Social Recovery Module

`lib/recovery/artifact.json` contains compiled, unmodified Candide Solidity from
https://github.com/candidelabs/candide-contracts at commit
`d0959d28ae084a7d549bb2c12d04482653456c2c`.
Author: CANDIDE Labs. Source SPDX identifier: GPL-3.0.
The upstream license is included in [licenses/CANDIDE-GPL-3.0.txt](licenses/CANDIDE-GPL-3.0.txt).
Pinned source hashes and the exact compiler/dependencies are recorded in the
artifact and [recovery guide](docs/recovery-design.md). `npm run prepare:recovery-contract`
reconstructs the artifact from the complete pinned source dependency graph.
This project does not claim authorship of the upstream contract or its cryptography.
