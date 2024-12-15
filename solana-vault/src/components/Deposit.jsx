import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const Deposit = () => {
    const [amount, setAmount] = useState('');
    const { publicKey } = useWallet();

    const handleDeposit = async () => {
        if (!publicKey) {
            alert('Connect your wallet first!');
            return;
        }

        // Placeholder for depositing logic
        console.log(`Depositing ${amount} SOL...`);
    };

    return (
        <div className="action-box">
            <h2>Deposit SOL</h2>
            <input
                type="number"
                placeholder="Amount in SOL"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
            />
            <button onClick={handleDeposit}>Deposit</button>
        </div>
    );
};

export default Deposit;
