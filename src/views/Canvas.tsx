import { useEffect, useRef, useState } from 'react';

import algosdk from 'algosdk';
import toast from 'react-hot-toast';

import { useWallet } from '@txnlab/use-wallet';
import { CANVAS_APP_INDEX, MAINNET_ASSET_INDEX, STAKING_APP_INDEX } from 'consts';
import abi from '../abi/OrangePlace.arc4.json';

type AccountData = {
    balance: number;
    assetBalance: number;
    assetOptedIn?: boolean;
};

type CanvasProps = {
    nodeUrl: string;
    nodePort: number;
};

const getColor = (value: number) => {
    if (value === 0) return `rgb(255, 255, 255)`;
    if (value === 255) return 'rgb(0, 0, 0)';

    const hue = (value * 1.4) % 360;
    const saturation = 100;
    const lightness = 50;

    const c = ((1 - Math.abs((2 * lightness) / 100 - 1)) * saturation) / 100;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = lightness / 100 - c / 2;

    let r, g, b;
    if (hue >= 0 && hue < 60) {
        [r, g, b] = [c, x, 0];
    } else if (hue >= 60 && hue < 120) {
        [r, g, b] = [x, c, 0];
    } else if (hue >= 120 && hue < 180) {
        [r, g, b] = [0, c, x];
    } else if (hue >= 180 && hue < 240) {
        [r, g, b] = [0, x, c];
    } else if (hue >= 240 && hue < 300) {
        [r, g, b] = [x, 0, c];
    } else {
        [r, g, b] = [c, 0, x];
    }

    const rgb = [r, g, b].map((v) => Math.round((v + m) * 255));
    return `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
};

function Canvas({ nodeUrl, nodePort }: CanvasProps) {
    const client = new algosdk.Algodv2('', nodeUrl, nodePort);
    const canvas = useRef<HTMLCanvasElement>(null);

    const [cost, setCost] = useState(0);
    const [accountData, setAccountData] = useState<AccountData>({ balance: 0, assetBalance: 0 });
    const [bufferAmount, setBufferAmount] = useState(1000);
    const canvasContract = new algosdk.ABIContract(abi);
    const [pixelsToUpdate, setPixelsToUpdate] = useState<
        { quadrant: Uint8Array; x: number; y: number; color: number }[]
    >([]);

    const { activeAccount, providers, signTransactions, signer } = useWallet();

    // add zoom https://codesandbox.io/p/sandbox/react-typescript-zoom-pan-html-canvas-p3itj?file=%2Fsrc%2FCanvas.tsx

    const keyToValue = (state: any, key: string): number => {
        const bKey = btoa(key);
        const kv = state.find((k: any) => k['key'] === bKey);
        if (kv) {
            return kv.value.uint;
        }
        return 0;
    };

    const fetchCost = async () => {
        const data = await client.getApplicationByID(CANVAS_APP_INDEX).do();
        const state = data['params']['global-state'];
        setCost(keyToValue(state, 'cost'));
    };

    const fetchBoxData = async () => {
        // get each box
    };

    const updateAccountData = async (address: string) => {
        const data = await client.accountInformation(address).do();
        const asset = data.assets.find((a: any) => a['asset-id'] === MAINNET_ASSET_INDEX);
        setAccountData({
            balance: data['amount'] - data['min-balance'] - 100000,
            assetOptedIn: !!asset,
            assetBalance: asset ? asset['amount'] : 0,
        });
    };

    useEffect(() => {
        fetchCost();
        fetchBoxData();
        const interval = setInterval(fetchCost, 10000);
        return () => clearInterval(interval);
    }, []);

    useEffect(() => {
        if (activeAccount?.address) {
            updateAccountData(activeAccount.address);
            const interval = setInterval(() => updateAccountData(activeAccount.address), 10000);
            return () => clearInterval(interval);
        } else {
            setAccountData({ assetBalance: 0, assetOptedIn: false, balance: 0 });
        }
    }, [activeAccount]);

    const signAndSendTransactions = async (txns: Uint8Array[]) => {
        return toast.promise(
            new Promise((resolve, reject) => {
                signTransactions(txns)
                    .catch(reject)
                    .then((blobs) => {
                        if (blobs)
                            client
                                .sendRawTransaction(blobs)
                                .do()
                                .catch(reject)
                                .then(({ txId }) => {
                                    algosdk.waitForConfirmation(client, txId, 5).catch(reject).then(resolve);
                                });
                        else reject('Failed to sign transactions.');
                    });
            }),
            {
                loading: 'Sending wallet transactions...',
                success: 'Transactions sent!',
                error: (e) => e?.toString(),
            },
        );
    };

    const updatePixels = async () => {
        if (activeAccount?.address) {
            try {
                const atc = new algosdk.AtomicTransactionComposer();
                const suggestedParams = await client.getTransactionParams().do();
                pixelsToUpdate.forEach((pixel) => {
                    atc.addTransaction({
                        txn: algosdk.makeAssetTransferTxnWithSuggestedParamsFromObject({
                            from: activeAccount.address,
                            to: algosdk.getApplicationAddress(CANVAS_APP_INDEX),
                            amount: cost + bufferAmount,
                            assetIndex: MAINNET_ASSET_INDEX,
                            suggestedParams,
                        }),
                        signer,
                    });
                    atc.addMethodCall({
                        appID: STAKING_APP_INDEX,
                        method: canvasContract.getMethodByName('updatePixel'),
                        sender: activeAccount.address,
                        boxes: new Array(8).fill({
                            appIndex: CANVAS_APP_INDEX,
                            name: pixel.quadrant,
                        }),
                        methodArgs: [pixel.x, pixel.y, pixel.color],
                        signer,
                        suggestedParams,
                    });
                });
                atc.buildGroup();
                // @ts-ignore
                const transactions = atc.transactions.map((tx) => algosdk.encodeUnsignedTransaction(tx.txn));
                signAndSendTransactions(transactions).then(() => updateAccountData(activeAccount?.address || ''));
            } catch (e: any) {
                toast.error(e?.toString());
            }
        }
    };

    return (
        <>
            <canvas ref={canvas} className="absolute bg-white w-full h-full top-0 bottom-0 left-0 right-0"></canvas>;
            <div className="absolute bottom-0 right-0 p-4">
                <div className="bg-orange-400 p-4 rounded">test</div>
            </div>
        </>
    );
}

export default Canvas;
