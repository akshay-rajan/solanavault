import React, { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';

const Withdraw = () => {
    const [amount, setAmount] = useState('');
    const { publicKey } = useWallet();

    const handleWithdraw = async () => {
        if (!publicKey) {
            alert('Connect your wallet first!');
            return;
        }

        // Placeholder for withdrawal logic
        console.log(`Withdrawing ${amount} SOL...`);
    };

    return (
        <div className="action-box">
            <h2>Withdraw SOL</h2>
            <input
                type="number"
                placeholder="Amount in SOL"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
            />
            <button onClick={handleWithdraw}>Withdraw</button>
        </div>
    );
};

export default Withdraw;
