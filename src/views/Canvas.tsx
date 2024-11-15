import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import algosdk from 'algosdk';
import toast from 'react-hot-toast';
import { useWallet } from '@txnlab/use-wallet';
import { CANVAS_APP_INDEX, MAINNET_ASSET_INDEX, STAKING_APP_INDEX } from 'consts';
import abi from '../abi/OrangePlace.arc4.json';
import CanvasComponent from 'components/Canvas';
import Button from 'components/Button';
import { Link } from 'react-router-dom';
import { classNames, formatAmount } from 'utils';
import orange_icon from '../assets/orange.svg';

type AccountData = {
    balance: number;
    assetBalance: number;
    assetOptedIn?: boolean;
};

type CanvasProps = {
    nodeUrl: string;
    nodePort: number;
};

export const getColor = (value: number) => {
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

let websocket: any;

function Canvas({ nodeUrl, nodePort }: CanvasProps) {
    const client = new algosdk.Algodv2('', nodeUrl, nodePort);
    const canvas = useRef<HTMLCanvasElement>(null);

    const [cost, setCost] = useState(0);
    const [accountData, setAccountData] = useState<AccountData>({ balance: 0, assetBalance: 0 });
    const [bufferAmount, setBufferAmount] = useState(1000);
    const canvasContract = new algosdk.ABIContract(abi);
    const [selectedPixel, setSelectedPixel] = useState<{ x: number; y: number } | null>(null);
    const [selectedColor, setSelectedColor] = useState<number>(0);
    const [canvasData, setCanvasData] = useState<{ [key: string]: number[] }>({});
    const [screenSize, setScreenSize] = useState([1000, 1000]);
    const [websocketOpen, setWebsocketOpen] = useState(false);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (websocketOpen) {
            fetchBoxData();
        }
    }, [websocketOpen]);

    const connectWebsocket = () => {
        let reconnectAttempt = 0;
        const maxReconnectDelay = 30000;

        const connect = () => {
            if (websocket && websocket.readyState === WebSocket.OPEN) {
                setWebsocketOpen(true);
                return;
            }

            const ws = new WebSocket(`wss://indexer.vestige.fi/ws/network/0/canvas`);

            ws.onopen = () => {
                setWebsocketOpen(true);
                reconnectAttempt = 0;
            };

            ws.onclose = () => {
                setWebsocketOpen(false);

                const delay = Math.min(1000 * Math.pow(2, reconnectAttempt), maxReconnectDelay);
                reconnectAttempt++;

                setTimeout(() => {
                    connect();
                }, delay);
            };

            ws.onerror = () => {
                if (ws) ws.close();
            };

            ws.onmessage = (m) => {
                try {
                    const message = JSON.parse(m.data);
                    const type = message.type;
                    const data = message.data;
                    switch (type) {
                        case 'update':
                            console.log(data);
                            const quadrant = new Uint8Array(data.quadrant);
                            const x = data.x;
                            const y = data.y;
                            const color = data.color;
                            setCanvasData((prev) => {
                                const newData = { ...prev };
                                const key = Buffer.from(quadrant).toString('base64');
                                newData[key] = [...newData[key]];
                                newData[key][y * 90 + x] = color;
                                return newData;
                            });
                            break;
                        default:
                            console.info(`Websocket message: ${message}`);
                            break;
                    }
                } catch (e) {
                    console.error(e);
                }
            };

            websocket = ws;
        };

        connect();
    };

    useLayoutEffect(() => {
        const updateSize = () => {
            setScreenSize([window.innerWidth, window.innerHeight]);
        };
        window.addEventListener('resize', updateSize);
        updateSize();
        return () => window.removeEventListener('resize', updateSize);
    }, []);

    const { activeAccount, providers, signTransactions, signer } = useWallet();

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

    const fetchBox = async (name: Uint8Array) => {
        const data = await client.getApplicationBoxByName(CANVAS_APP_INDEX, name).do();
        setCanvasData((prev) => ({ ...prev, [Buffer.from(name).toString('base64')]: Array.from(data.value) }));
        return Array.from(data.value);
    };

    const fetchBoxData = async () => {
        const promises = [];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                const name = new Uint8Array([i, j]);
                promises.push(fetchBox(name));
            }
        }
        Promise.all(promises);
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
        connectWebsocket();
        fetchCost();

        const interval = setInterval(fetchCost, 10000);

        return () => {
            clearInterval(interval);
        };
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
                                    algosdk.waitForConfirmation(client, txId, 15).catch(reject).then(resolve);
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

    const updatePixel = async () => {
        if (activeAccount?.address) {
            try {
                setLoading(true);
                const atc = new algosdk.AtomicTransactionComposer();
                const suggestedParams = await client.getTransactionParams().do();
                suggestedParams.flatFee = true;
                suggestedParams.fee = 3000;
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
                const quadrant = new Uint8Array([Math.floor(selectedPixel!.y / 90), Math.floor(selectedPixel!.x / 90)]);
                const x = selectedPixel!.x % 90;
                const y = selectedPixel!.y % 90;
                suggestedParams.fee = 0;
                atc.addMethodCall({
                    appID: CANVAS_APP_INDEX,
                    method: canvasContract.getMethodByName('updatePixel'),
                    sender: activeAccount.address,
                    boxes: new Array(8).fill({
                        appIndex: CANVAS_APP_INDEX,
                        name: quadrant,
                    }),
                    methodArgs: [quadrant, x, y, selectedColor],
                    signer,
                    suggestedParams,
                });
                atc.buildGroup();
                // @ts-ignore
                const transactions = atc.transactions.map((tx) => algosdk.encodeUnsignedTransaction(tx.txn));
                signAndSendTransactions(transactions).then(() => {
                    updateAccountData(activeAccount?.address || '');
                    setCanvasData((prev) => {
                        const newData = { ...prev };
                        const key = Buffer.from(quadrant).toString('base64');
                        newData[key] = [...newData[key]];
                        newData[key][y * 90 + x] = selectedColor;
                        return newData;
                    });
                    setSelectedPixel(null);
                    setLoading(false);
                });
            } catch (e: any) {
                toast.error(e?.toString());
                setLoading(false);
            }
        }
    };

    const nearbyColors = useMemo(() => {
        // get colors in nearby positions to selected pixel
        const colors: Record<number, number> = {};
        if (selectedPixel) {
            const { x, y } = selectedPixel;
            const searchSquareWidth = 10;
            const searchSquareX = Math.min(269 - searchSquareWidth, Math.max(0, x - searchSquareWidth / 2));
            const searchSquareY = Math.min(269 - searchSquareWidth, Math.max(0, y - searchSquareWidth / 2));
            console.log(x, y, searchSquareX, searchSquareY);
            for (let i = searchSquareY; i < searchSquareY + searchSquareWidth + 1; i++) {
                for (let j = searchSquareX; j < searchSquareX + searchSquareWidth + 1; j++) {
                    const quadrant = Buffer.from([Math.floor(i / 90), Math.floor(j / 90)]);
                    if (!canvasData[quadrant.toString('base64')]) continue;
                    const quadrantY = i % 90;
                    const quadrantX = j % 90;
                    const color = canvasData[Buffer.from(quadrant).toString('base64')][quadrantY * 90 + quadrantX];
                    if (!colors[color]) colors[color] = 0;
                    colors[color]++;
                }
            }
        }
        const sortedColors = Object.entries(colors).sort((a, b) => b[1] - a[1]);
        return sortedColors.map((color) => parseInt(color[0])).slice(0, 5);
    }, [selectedPixel, canvasData]);

    const formatJohnsToOra = (johns: number) => {
        const oraPerJohn = 0.00000001;
        return (oraPerJohn * johns).toFixed(8);
    };

    return (
        <>
            <div className="absolute top-0 left-0 p-8 z-20">
                <Link to="/" className="pointer-events-auto hover:opacity-80 transition-all">
                    <img src={orange_icon} className={classNames('w-16 md:w-20 lg:w-24 h-full z-20')} />
                </Link>
            </div>
            <div className="absolute flex flex-col justify-center items-center w-full h-full overflow-hidden hidden md:block">
                <CanvasComponent
                    canvasWidth={screenSize[0]}
                    canvasHeight={screenSize[1]}
                    canvasData={canvasData}
                    selectedColor={selectedColor}
                    selectedPixel={selectedPixel}
                    setSelectedPixel={setSelectedPixel}
                />

                <div className="absolute justify-center items-center flex-col top-0 bottom-0 right-0 p-8 hidden md:flex">
                    <button
                        className={classNames(
                            'text-sm opacity-60 font-bold p-2',
                            websocketOpen ? 'text-green-600' : 'text-red-600',
                        )}
                        onClick={connectWebsocket}
                    >
                        {websocketOpen ? 'Canvas updates automatically' : 'Disconnected from live updates'}
                    </button>
                    <div className="bg-orange-400 p-4 rounded flex flex-col space-y-2 justify-center items-center">
                        {activeAccount?.address && (
                            <div className="flex justify-center space-x-2 items-center">
                                <Button
                                    onClick={() => providers?.forEach((p) => p.disconnect())}
                                    secondary
                                    className="text-sm"
                                >
                                    Disconnect
                                </Button>
                                <a href="https://vestige.fi/asset/1284444444" target="_blank" rel="noreferrer">
                                    <Button className="text-sm">Buy ORA</Button>
                                </a>
                            </div>
                        )}
                        <div className="grid grid-cols-16 border-2 rounded border-orange-900">
                            {new Array(256).fill(0).map((_, i) => (
                                <button
                                    key={`color-${i}`}
                                    style={{
                                        backgroundColor: getColor(i),
                                        width: 16,
                                        height: 16,
                                        borderWidth: selectedColor === i ? 1 : 0,
                                        borderColor: i === 255 ? 'white' : 'black',
                                    }}
                                    onClick={() => setSelectedColor(i)}
                                />
                            ))}
                        </div>
                        {nearbyColors.length > 0 && (
                            <div className="flex justify-center space-x-2  items-center">
                                <span className="font-bold">Nearby colors:</span>
                                <div className="flex justify-center items-center border-2 rounded border-orange-900">
                                    {nearbyColors.map((color) => (
                                        <button
                                            key={`nearby-color-${color}`}
                                            style={{
                                                backgroundColor: getColor(color),
                                                width: 16,
                                                height: 16,
                                                borderWidth: selectedColor === color ? 1 : 0,
                                                borderColor: color === 255 ? 'white' : 'black',
                                            }}
                                            onClick={() => setSelectedColor(color)}
                                        />
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="text-center font-bold">
                            {!!activeAccount && (
                                <div>
                                    You have {formatAmount(accountData.assetBalance, 0)}{' '}
                                    <span className="font-semibold opacity-80">johns</span>
                                </div>
                            )}
                            <span>Cost per pixel:</span> {cost} <span className="font-semibold opacity-80">johns</span>{' '}
                            <br />
                            <span className="text-sm opacity-60">
                                {cost} johns = {formatJohnsToOra(cost)} ORA
                            </span>
                        </div>
                        {activeAccount?.address ? (
                            <div className="flex flex-col space-y-2 items-center justify-center">
                                <Button
                                    disabled={
                                        loading || !selectedPixel || cost + bufferAmount > accountData.assetBalance
                                    }
                                    onClick={updatePixel}
                                >
                                    Draw pixel
                                </Button>
                            </div>
                        ) : (
                            <div className="max-w-sm flex flex-col text-center gap-2 items-center">
                                {providers?.map((p) => (
                                    <Button onClick={p.connect} key={`connect-${p.metadata.id}`}>
                                        <div className="flex space-x-2 items-center">
                                            <img className="w-8 h-8 rounded" src={p.metadata.icon} />
                                            <span>Connect {p.metadata.name}</span>{' '}
                                        </div>
                                    </Button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
            <div className="md:hidden text-sm flex justify-center items-center w-screen h-screen">
                <div className="w-80 bg-white border rounded-lg p-4 text-center font-bold">
                    This page does not work on mobile.
                    <br />
                    Please join us on desktop.
                </div>
            </div>
        </>
    );
}

export default Canvas;
