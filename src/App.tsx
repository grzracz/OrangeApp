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
    MAINNET_NODE_PORT,
    MAINNET_NODE_URL,
    TESTNET_APP_INDEX,
    TESTNET_ASSET_INDEX,
    TESTNET_NODE_PORT,
    TESTNET_NODE_URL,
} from 'consts';
import Staking from 'views/Staking';
import Canvas from 'views/Canvas';

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
                                applicationId={TESTNET_APP_INDEX}
                                assetId={TESTNET_ASSET_INDEX}
                            />
                        }
                    />
                    <Route
                        path="mainnet"
                        element={
                            <Staking
                                nodeUrl={MAINNET_NODE_URL}
                                nodePort={MAINNET_NODE_PORT}
                                applicationId={MAINNET_APP_INDEX}
                                assetId={MAINNET_ASSET_INDEX}
                                isMainnet
                            />
                        }
                    />
                    <Route path="canvas" element={<Canvas nodeUrl={MAINNET_NODE_URL} nodePort={MAINNET_NODE_PORT} />} />
                    {/* <Route
                        path="mainnet-old"
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
                    /> */}
                </Routes>
            </HashRouter>
        </WalletProvider>
    );
}

export default App;
