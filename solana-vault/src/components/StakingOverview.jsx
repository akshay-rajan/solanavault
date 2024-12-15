import React, { useEffect, useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { Connection } from '@solana/web3.js';

const StakingOverview = () => {
    const { publicKey } = useWallet();
    const [balance, setBalance] = useState(0);

    useEffect(() => {
        const fetchBalance = async () => {
            if (publicKey) {
                const connection = new Connection('https://api.mainnet-beta.solana.com');
                const lamports = await connection.getBalance(publicKey);
                setBalance(lamports / 1e9); // Convert to SOL
            }
        };

        fetchBalance();
    }, [publicKey]);

    return (
        <div className="staking-overview">
            <h2>Staking Overview</h2>
            {publicKey ? (
                <div>
                    <p>Wallet Address: {publicKey.toString()}</p>
                    <p>Balance: {balance} SOL</p>
                </div>
            ) : (
                <p>Connect your wallet to view staking details.</p>
            )}
        </div>
    );
};

export default StakingOverview;
