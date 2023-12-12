import { useEffect } from 'react';

function Background() {
    useEffect(() => {
        const colors = ['#FFA500', '#F4BB44', '#FFE5B4', '#FF7518', '#CC5500'];

        const numBalls = 50;
        const balls = [];

        const container = document.getElementById('bg');

        for (let i = 0; i < numBalls; i++) {
            let ball = document.createElement('svg');
            ball.classList.add('ball');
            ball.style.background = colors[Math.floor(Math.random() * colors.length)];
            ball.style.left = `${Math.floor(Math.random() * 100)}vw`;
            ball.style.top = `${Math.floor(Math.random() * 100)}vh`;
            ball.style.transform = `scale(${Math.random()})`;
            ball.style.width = `${Math.random()}em`;
            ball.style.height = ball.style.width;

            balls.push(ball);
            container?.append(ball);
        }

        // Keyframes
        balls.forEach((el, i) => {
            let to = {
                x: Math.random() * (i % 2 === 0 ? -11 : 11),
                y: Math.random() * 12,
            };

            el.animate([{ transform: 'translate(0, 0)' }, { transform: `translate(${to.x}rem, ${to.y}rem)` }], {
                duration: (Math.random() + 1) * 2000, // random duration
                direction: 'alternate',
                fill: 'both',
                iterations: Infinity,
                easing: 'ease-in-out',
            });
        });
    }, []);

    return <></>;
}

export default Background;
