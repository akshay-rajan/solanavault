import React from 'react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

const Header = () => {
    return (
        <header className="header">
            <h1>Solana Staking Platform</h1>
            <WalletMultiButton />
        </header>
    );
};

export default Header;
