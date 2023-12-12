import { WalletProvider, useInitializeProviders, PROVIDER_ID } from '@txnlab/use-wallet';
import { DeflyWalletConnect } from '@blockshake/defly-connect';
import { PeraWalletConnect } from '@perawallet/connect';
import { Toaster } from 'react-hot-toast';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Mining from './views/Mining';
import Background from './components/Background';
import Home from './views/Home';
import algosdk from 'algosdk';

function App() {
    const providers = useInitializeProviders({
        providers: [
            { id: PROVIDER_ID.DEFLY, clientStatic: DeflyWalletConnect },
            { id: PROVIDER_ID.PERA, clientStatic: PeraWalletConnect },
        ],
        nodeConfig: {
            network: 'testnet',
            nodeServer: 'https://testnet-api.algonode.cloud',
            nodeToken: '',
            nodePort: '443',
        },
        algosdkStatic: algosdk,
    });

    return (
        <WalletProvider value={providers}>
            <Toaster position="bottom-right" />
            <Background />
            <HashRouter>
                <Routes>
                    <Route index Component={Home} />
                    <Route path="mining" Component={Mining} />
                </Routes>
            </HashRouter>
            <span className="p-2 absolute bottom-0 left-0 text-sm opacity-20">Powered by Nodely.io</span>
        </WalletProvider>
    );
}

export default App;
