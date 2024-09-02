# Alpha Build 1 :: Challenge 1 :: Wallet UI

You will be using the [Aztec Sandbox](https://docs.aztec.network/guides/developer_guides/getting_started/quickstart) and aztec.js in order to build a GUI that will allow users to manage Aztec accounts and interact with the Aztec network (local sandbox for now).

## Context

The Sandbox is a local environment of the Aztec network execution context. It does not do any real proving or verifying of zero-knowledge proofs, they are just mocked, so this rapidly increases the pace of development. Once projects have been developed and tested on the Sandbox, they can be tested on a devnet or (upcoming) testnet (dates TBD).

## [Challenge 1 docs](https://docs.aztec.network)

A general review of the [docs site](https://docs.aztec.network) can help you get a high level understanding of the protocol and understand where you can find certain information going forward.

### [Wallet](https://docs.aztec.network/aztec/concepts/wallets/architecture)

This page helps provide context about how wallets in Aztec work.

### [PXE](https://docs.aztec.network/aztec/concepts/pxe)

The private execution environment (PXE) is an integral part of how users will interact with the network. The PXE will hold private information, execute private programs, and generate client-side transaction proofs to send to the network.

### [Authentication witnesses](https://docs.aztec.network/guides/developer_guides/smart_contracts/writing_contracts/authwit)

Authentication witnesses are an important aspect of Aztec accounts. These are how users grant permission for other accounts / contracts to do actions on their behalf.

- [Using Authentication witnesses in aztec.js](https://docs.aztec.network/guides/developer_guides/js_apps/authwit)
- [Using them in contracts](https://docs.aztec.network/guides/developer_guides/smart_contracts/writing_contracts/authwit#usage)

## Prerequisites

- [Docker](https://docs.docker.com/get-docker/)
- Node.js (v18 or 20, recommended to install with [nvm](https://github.com/nvm-sh/nvm))
- [Aztec Sandbox](https://docs.aztec.network/guides/developer_guides/getting_started/quickstart)

## Getting Started

Getting aztec.js running in the browser can be difficult. We created [this boilerplate repo](https://github.com/critesjosh/aztec-wallet-ui-starter) to make it easier to get started. It may still be a bit slow to load, but it should work.

We also have a [React project starter here](https://github.com/AztecProtocol/aztec-packages/tree/master/boxes/boxes/react).

Let us know if you run into any issues or have suggestions for improvements.

## Suggestions

Here is a list of actions that a UI wallet could allow a user to do:

- Create a new account,
- Create a new account with a specific key,
- Connect to a contract / application, check out the [shieldswap modal](https://docs.shieldswap.org/modal)
- Send transactions to that application
- Read contract data from the application
- Connect to Ethereum and Aztec,
- Bridge tokens to/from Ethereum to Aztec with private and public claiming
- See the status of a transaction
- Privately and publicly send tokens to other accounts
- Other functionality from the [CLI Wallet](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/cli-wallet)

## Resources

- [Boilerplate browser wallet repo](https://github.com/critesjosh/aztec-wallet-ui-starter)
- [React project starter](https://github.com/AztecProtocol/aztec-packages/tree/master/boxes/boxes/react)
- [Aztec CLI wallet](https://github.com/AztecProtocol/aztec-packages/tree/master/yarn-project/cli-wallet)
- [aztec.js reference](https://docs.aztec.network/reference/developer_references/aztecjs/aztec-js)
- Connect a wallet application managing accounts to another application using wallet connect using the [shieldswap modal](https://docs.shieldswap.org/modal)
- [Example token contract tutorial](https://docs.aztec.network/tutorials/codealong/contract_tutorials/token_contract) – consider including token transfers and interactions with the token contract into the interface
- [Account contract tutorial](https://docs.aztec.network/tutorials/codealong/contract_tutorials/write_accounts_contract) – Understand how contract accounts in Aztec work at the contract level
- [Schedule a call](https://calendly.com/josh-aztec/30min) with dev rel

## Submission

Project submissions are due [September 15th, 2024](https://forms.gle/VBbL8wA4f3an227M7). Please fill out [this form](https://forms.gle/VBbL8wA4f3an227M7) with all of the relevant information. You only need to submit a project one time on behalf of your team.
