![Aztec Wallet Logo](public/aztec.png)

# Aztec Wallet UI 

I've been working on Aztec Wallet UI - an intuitive wallet application based on the Aztec Protocol. It enables you to safely and easily manage your cryptocurrency accounts by creating new ones, importing existing accounts, and quickly switching between them. For extra security, optional two-factor authentication may be enabled using HMAC-based One-Time Passwords. Token creation and minting, import of contracts, and balance management are also easily achievable. You can view your transaction history, including pending and completed transactions, and shield, unshield, or send tokens with ease. This wallet interacts with decentralized apps through ShieldSwap using WalletConnect.

# Demo

https://github.com/user-attachments/assets/418f2db6-0f2d-4aaf-8e4f-3f65b48e552d

## Table of Contents

- [Features](#features)
  - [Account Management](#account-management)
  - [Token Management](#token-management)
  - [WalletConnect Integration](#walletconnect-integration)
  - [Transaction Handling](#transaction-handling)
  - [User Interface](#user-interface)
  - [2FA Feature Through Account Abstraction](#2fa-feature-through-account-abstraction)
- [Getting Started](#getting-started)
  - [Prerequisites](#prerequisites)
  - [Installation](#installation)
  - [Running the Application](#running-the-application)
- [Project Structure](#project-structure)
- [License](#license)

## Features

Aztec Wallet UI encompasses a wide range of features designed to provide users with a secure and efficient cryptocurrency management experience. Below is a detailed overview of each feature.

### Account Management

Effortlessly manage your cryptocurrency accounts with Aztec Wallet UI. Whether you're creating new accounts, importing existing ones, or switching between multiple accounts, the process is seamless and intuitive. Enhance the security of your accounts with optional **Two-Factor Authentication (2FA)** using **HMAC-based One-Time Passwords (HOTP)**.

- **Creating Accounts:** Start by creating a standard account, followed by a 2FA-enabled account for enhanced security.
  
https://github.com/user-attachments/assets/7e8847fc-176b-409d-a544-b004851314df
  
- **Importing Accounts:** Easily import your existing accounts.
  
https://github.com/user-attachments/assets/01a7cfbf-df1c-4cfb-b8f5-73eb3dce9f46

### Token Management

Aztec Wallet UI allows you to create new tokens, mint existing ones, import token contracts, and manage your token balances seamlessly. Execute essential token operations such as sending, unshielding, and shielding and redeeming directly from the wallet interface.

https://github.com/user-attachments/assets/9a2c4b72-0907-47c5-af53-10e61ca341d6

### WalletConnect Integration

Connect the wallet to a wide range of decentralized applications (dApps). Seamlessly interact with various dApps, authorize transactions securely, and manage your connections directly within the wallet.

https://github.com/user-attachments/assets/b6418b90-dc54-4916-ab27-38341af3292d

### Transaction Handling

Maintain a comprehensive overview of all your cryptocurrency transactions. Aztec Wallet UI provides a detailed transaction history, allowing you to filter transactions by action type, view in-depth information, and monitor pending transactions.

https://github.com/user-attachments/assets/022e475a-e695-4510-aa38-4f208199be1f

### User Interface

Experience a clean, intuitive, and responsive user interface designed for optimal usability across all devices. The UI encompasses:

- **Header and Footer:** Consistent navigation and branding elements that provide seamless access to different sections of the wallet.
- **Dynamic Forms and Modals:** Interactive elements that facilitate various wallet operations.
- **Responsive Tables:** Easily view and manage your token balances and transaction histories with adaptable table designs that adapt to different screen sizes.

### 2FA Feature Through Account Abstraction

Aztec Wallet UI leverages Aztec's Account Abstraction to provide users with the ability to enable **Two-Factor Authentication (2FA)** through **HMAC-based One-Time Passwords (HOTP)** for their contract accounts. 
This implementation ensures that every time a user interacts with their account contract, they must provide a one-time key, significantly enhancing the security of their transactions. 
Moreover, this abstraction provides flexibility and breathing room when dealing with complex DeFi protocols by accepting also the generated code before and after.

## Getting Started

Follow these instructions to set up and run the Aztec Wallet UI on your local machine.

### Prerequisites

Ensure you have the following installed on your system:

- **Node.js** (v20 or higher)
- **yarn**
- **Git**

### Installation

1. **Clone the Repository**

   ```bash
   git clone https://github.com/joaolago1113/aztec_wallet.git
   cd aztec_wallet
   ```

2. **Install Dependencies**

   Using yarn:

   ```bash
   yarn
   ```

3. **Configure Environment Variables**

   Change the `config.ts` file in the src directory and add the necessary configuration variables:

   ```env
   WALLETCONNECT_PROJECT_ID=your_walletconnect_project_id
   L1_RPC_URL=http://localhost:8545/
   PXE_URL=https://localhost:8080/
   ```

   *Replace the placeholder values with your actual configuration details.*

4. **Start the Aztec Sandbox**

   The application relies on the Aztec sandbox environment. Follow the [Aztec Sandbox Quickstart](https://docs.aztec.network/guides/developer_guides/getting_started/quickstart) to set up and start the sandbox.

   ```bash
   aztec start --sandbox
   ```

   *This command initializes the sandbox environment necessary to test the wallet.*

### Running the Application

Start the development server:

```bash
yarn dev
```

Open your browser and navigate to `http://localhost:5173` to view the application.

## Project Structure

Here's an overview of the project's directory and file structure:

```
aztec_wallet/
├── index.html
├── package.json
├── public
│   ├── apps.html
│   ├── aztec.png
│   ├── bridge.html
│   ├── footer.html
│   ├── header.html
│   ├── tokens.html
│   └── transactions.html
├── src
│   ├── components
│   │   ├── Footer.ts
│   │   └── Header.ts
│   ├── config.ts
│   ├── contracts
│   │   ├── EcdsaKHOTPAccountContract.ts
│   │   ├── Nargo.toml
│   │   ├── src
│   │   │   ├── hotp_note.nr
│   │   │   └── main.nr
│   │   └── target
│   │       ├── ecdsa_k_hotp_account_contract-EcdsaKHOTPAccount.json
│   │       └── ecdsa_k_hotp_account_contract-EcdsaKHOTPAccount.json.bak
│   ├── factories
│   │   ├── KeystoreFactory.ts
│   │   ├── PXEFactory.ts
│   │   └── WalletSdkFactory.ts
│   ├── main.ts
│   ├── services
│   │   ├── AccountService.ts
│   │   ├── BridgeService.ts
│   │   ├── TokenService.ts
│   │   ├── TransactionService.ts
│   │   └── WalletConnectService.ts
│   ├── style.css
│   ├── ui
│   │   └── UIManager.ts
│   ├── utils
│   │   ├── CryptoUtils.ts
│   │   ├── CustomWalletUtils.ts
│   │   └── Keystore.ts
│   └── vite-env.d.ts
├── tsconfig.json
├── vite.config.ts
└── yarn.lock
```

### Detailed Breakdown

- **`index.html`**
  - **Purpose**: The main entry point of the application and HTML of the accounts page.

- **`package.json`**
  - **Purpose**: Defines the project dependencies, scripts, metadata, and other configuration details necessary for the Node.js environment.

- **`public/`**
  - **Description**: Contains all the static assets and HTML files that are served directly to the client.
  
  - **HTML Files:**
    - **`apps.html`**
      - **Purpose**: Interface for connecting external applications using WalletConnect.
      
    - **`footer.html`**
      - **Purpose**: The footer section of the application, typically containing links to privacy policy, terms of service, etc.
      
    - **`header.html`**
      - **Purpose**: The header section, including the logo, navigation links, and account dropdown menu.
      
    - **`tokens.html`**
      - **Purpose**: Interface for managing tokens, including viewing balances, creating/minting/importing tokens, and handling redeeming shields.
      
    - **`transactions.html`**
      - **Purpose**: Displays the transaction history with filtering options.
  
  - **Static Assets:**
    - **`aztec.png`**
      - **Purpose**: The favicon or logo image used in the application.

#### `src/`

- **`components/`**
  - **Purpose**: Reusable UI components used across different parts of the application.
  
  - **Files:**
    - **`Footer.ts`**
      - **Purpose**: Defines the footer component of the application.
      
    - **`Header.ts`**
      - **Purpose**: Defines the header component, including the logo, navigation links, and account dropdown.

- **`config.ts`**
  - **Purpose**: Stores configuration constants such as RPC URLs, PXE URLs, WalletConnect project ID, and SDK metadata.

- **`contracts/`**
  - **Purpose**: Contains smart contract-related files and configurations.
  
  - **Files and Directories:**
    - **`EcdsaKHOTPAccountContract.ts`**
      - **Purpose**: Defines the custom account contract supporting ECDSA and HOTP (HMAC-based One-Time Password) for 2FA.
      
    - **`Nargo.toml`**
      - **Purpose**: Configuration file for the Nargo tool, which is used for compiling Noir smart contracts.
      
    - **`src/`**
      - **Purpose**: Contains Noir (`.nr`) smart contract source files.
      
      - **Files:**
        - **`hotp_note.nr`**
          - **Purpose**: Defines the structure and logic for HOTP-based notes.
          
        - **`main.nr`**
          - **Purpose**: The main Noir smart contract file implementing the wallet's core functionalities.
    
    - **`target/`**
      - **Purpose**: Output directory for compiled smart contracts and related artifacts.
      
      - **Files:**
        - **`ecdsa_k_hotp_account_contract-EcdsaKHOTPAccount.json`**
          - **Purpose**: Compiled JSON artifact of the ECDSA and HOTP account contract.
          
        - **`ecdsa_k_hotp_account_contract-EcdsaKHOTPAccount.json.bak`**
          - **Purpose**: Backup file for the compiled contract JSON artifact.

- **`factories/`**
  - **Purpose**: Contains factory pattern classes responsible for creating and managing instances of various services and SDKs.
  
  - **Files:**
    - **`KeystoreFactory.ts`**
      - **Purpose**: Manages the creation and retrieval of the `Keystore` instance.
      
    - **`PXEFactory.ts`**
      - **Purpose**: Handles the creation and initialization of the `PXE` (Privacy Execution Environment) instance.
      
    - **`WalletSdkFactory.ts`**
      - **Purpose**: Responsible for creating and providing a singleton instance of the `ShieldswapWalletSdk`.

- **`main.ts`**
  - **Purpose**: The primary TypeScript file that initializes the application, sets up services, and manages the overall app lifecycle.

- **`services/`**
  - **Purpose**: Service classes encapsulating business logic and interacting with different parts of the application.
  
  - **Files:**
    - **`AccountService.ts`**
      - **Purpose**: Manages account-related operations such as creating, importing, and managing user accounts with optional 2FA.
      
    - **`TokenService.ts`**
      - **Purpose**: Manages token-related operations such as creating, minting, shielding, unshielding, redeeming and transferring tokens.
      
    - **`TransactionService.ts`**
      - **Purpose**: Handles transaction-related functionalities including fetching, saving, and managing transaction history.
      
    - **`WalletConnectService.ts`**
      - **Purpose**: Manages WalletConnect integrations, enabling connections with decentralized applications.

- **`style.css`**
  - **Purpose**: Defines the visual styling of the application, including layout, colors, typography, and responsive design elements.

- **`ui/`**
  - **Purpose**: UI management classes responsible for updating and interacting with the user interface.
  
  - **Files:**
    - **`UIManager.ts`**
      - **Purpose**: Oversees UI updates, handles user interactions, manages modals, and interfaces with various services to reflect changes in the UI.

- **`utils/`**
  - **Purpose**: Utility functions and helper classes to support various operations within the application.
  
  - **Files:**
    - **`CryptoUtils.ts`**
      - **Purpose**: Contains cryptographic utility functions for creating secret keys.
      
    - **`CustomWalletUtils.ts`**
      - **Purpose**: Provides custom utility specific to the wallet's requirements.
      
    - **`Keystore.ts`**
      - **Purpose**: Implements the `Keystore` class responsible for securely storing and retrieving sensitive data like private keys and transaction history.

- **`vite-env.d.ts`**
  - **Purpose**: Provides TypeScript declarations for Vite-specific global variables and modules.

## Environment Versions

To ensure a smooth and compatible development experience with Aztec Wallet UI Starter, please verify that your environment matches the following software versions:

| **Tool**           | **Version**                                                                                       |
|--------------------|---------------------------------------------------------------------------------------------------|
| **Aztec**          | `0.55.1`                                                                                           |
| **Nargo**          | `0.34.0`                                                                                           |
| **Noir**           | `0.34.0+1d3c4e854608cf8e92bc7bd7b2dad73fb8e0b823ac70b57ef44bfd61b92f5dc0`                                                  |
| **Node.js**        | `v22.2.0`                                                                                          |
| **Yarn**           | `1.22.22`                                                                                          |

## License

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
