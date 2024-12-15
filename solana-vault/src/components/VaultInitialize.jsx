import React, { useState } from 'react';
import { useConnection, useWallet } from '@solana/wallet-adapter-react';
import * as anchor from '@project-serum/anchor';

const VaultInitialize = () => {
    const { connection } = useConnection();
    const { publicKey, sendTransaction } = useWallet();

    const [status, setStatus] = useState('');

    const initializeVault = async () => {
        try {
            const provider = new anchor.AnchorProvider(connection, { publicKey, sendTransaction });
            const program = new anchor.Program(IDL, PROGRAM_ID, provider);

            await program.methods.initVault()
                .accounts({
                    authority: publicKey,
                    vaultAccount: vaultPublicKey,
                })
                .rpc();

            setStatus('Vault initialized successfully.');
        } catch (err) {
            setStatus(`Error: ${err.message}`);
        }
    };

    return (
        <div>
            <h2>Initialize Vault</h2>
            <button onClick={initializeVault}>Initialize</button>
            {status && <p>{status}</p>}
        </div>
    );
};

export default VaultInitialize;
