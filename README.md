# Medical Records DApp

A decentralized medical records application built with React, Hardhat, and Pinata IPFS.

## 🚀 Getting Started

Follow these steps to run the project locally.

### Prerequisites
- Node.js (v18 or higher)
- MetaMask installed in your browser

### 1. Clone the Repository
```bash
git clone https://github.com/Pranav-kb006/medicalapp.git
cd medicalapp
```

### 2. Install Dependencies
Install dependencies for both the smart contracts and the frontend:

```bash
# Install root dependencies (Hardhat)
npm install

# Install web dependencies (React)
cd web
npm install
cd ..
```

### 3. Environment Setup
You need to configure the environment variables for the frontend.

1. Navigate to the `web` folder:
   ```bash
   cd web
   ```
2. Copy the example environment file:
   ```bash
   cp .env.example .env
   # OR on Windows
   copy .env.example .env
   ```
3. Open `.env` and fill in your keys:
   - `NEXT_PUBLIC_PINATA_JWT`: Your Pinata JWT Token (Required for uploads)
   - `NEXT_PUBLIC_CONTRACT_ADDRESS`: Already set (0x818FC828b579910ec415d606e4EA34B380cF1d06)

### 4. Run the Application
Start the frontend development server:

```bash
# Inside the 'web' folder
npm run dev
```

Open [http://localhost:4000](http://localhost:4000) in your browser.

## 📜 Smart Contract
The contract is deployed on Tenderly at: `0x818FC828b579910ec415d606e4EA34B380cF1d06`

## 🛠️ Tech Stack
- **Frontend:** React, Vite, TailwindCSS
- **Blockchain:** Hardhat, Ethers.js
- **Storage:** IPFS (via Pinata)
