import { WalletProvider, useInitializeProviders, PROVIDER_ID } from '@txnlab/use-wallet';
import { DeflyWalletConnect } from '@blockshake/defly-connect';
import { PeraWalletConnect } from '@perawallet/connect';
import { Toaster } from 'react-hot-toast';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Mining from './views/Mining';
import Background from './components/Background';
import Home from './views/Home';
import algosdk from 'algosdk';
import {
    MAINNET_APP_INDEX,
    MAINNET_ASSET_INDEX,
    MAINNET_INDEXER_PORT,
    MAINNET_INDEXER_URL,
    MAINNET_NODE_PORT,
    MAINNET_NODE_URL,
    TESTNET_APP_INDEX,
    TESTNET_ASSET_INDEX,
    TESTNET_INDEXER_PORT,
    TESTNET_INDEXER_URL,
    TESTNET_NODE_PORT,
    TESTNET_NODE_URL,
} from 'consts';

function App() {
    const providers = useInitializeProviders({
        providers: [
            { id: PROVIDER_ID.DEFLY, clientStatic: DeflyWalletConnect },
            { id: PROVIDER_ID.PERA, clientStatic: PeraWalletConnect },
        ],
        algosdkStatic: algosdk,
    });

    return (
        <WalletProvider value={providers}>
            <Toaster position="bottom-right" />
            <Background />
            <HashRouter>
                <Routes>
                    <Route index element={<Home />} />
                    <Route
                        path="testnet"
                        element={
                            <Mining
                                nodeUrl={TESTNET_NODE_URL}
                                nodePort={TESTNET_NODE_PORT}
                                indexerUrl={TESTNET_INDEXER_URL}
                                indexerPort={TESTNET_INDEXER_PORT}
                                applicationId={TESTNET_APP_INDEX}
                                assetId={TESTNET_ASSET_INDEX}
                            />
                        }
                    />
                    <Route
                        path="mainnet"
                        element={
                            <Mining
                                nodeUrl={MAINNET_NODE_URL}
                                nodePort={MAINNET_NODE_PORT}
                                indexerUrl={MAINNET_INDEXER_URL}
                                indexerPort={MAINNET_INDEXER_PORT}
                                applicationId={MAINNET_APP_INDEX}
                                assetId={MAINNET_ASSET_INDEX}
                                isMainnet
                            />
                        }
                    />
                </Routes>
            </HashRouter>
            <span className="p-2 lg:absolute bottom-0 left-0 text-sm opacity-20">Powered by Nodely.io</span>
        </WalletProvider>
    );
}

export default App;
