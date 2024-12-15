import React from 'react';
import WalletContextProvider from './context/WalletContext';
import Header from './components/Header';
import StakingOverview from './components/StakingOverview';
import Deposit from './components/Deposit';
import Withdraw from './components/Withdraw';

const App = () => {
    return (
        <WalletContextProvider>
            <Header />
            <div className="container">
                <StakingOverview />
                <div className="actions">
                    <Deposit />
                    <Withdraw />
                </div>
            </div>
        </WalletContextProvider>
    );
};

export default App;
