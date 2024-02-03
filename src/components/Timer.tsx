import { useMemo } from 'react';

type TimerProps = {
    diff: number;
};

function Timer({ diff }: TimerProps) {
    const fill = (num: number, name: string) => {
        return num.toString() + ` ${name}${num === 1 ? ' ' : 's '}`;
    };

    const [days, hours, minutes, seconds] = useMemo(() => {
        const abs = Math.abs(diff);
        const s = Math.floor(abs / 1000) % 60;
        const m = Math.floor(abs / (60 * 1000)) % 60;
        const h = Math.floor(abs / (3600 * 1000)) % 24;
        const d = Math.floor(abs / (24 * 3600 * 1000));
        return [d > 0 ? fill(d, 'day') : '', fill(h, 'hour'), fill(m, 'minute'), fill(s, 'second')];
    }, [diff]);

    return (
        <div>
            <div className="font-bold text-lg text-center pb-2">Staking starts in:</div>
            <div className="flex flex-col items-center font-mono bg-orange-600 text-white rounded-lg font-bold px-4 py-2">
                {days}
                {hours}
                {minutes}
                {seconds}
            </div>
        </div>
    );
}

export default Timer;
