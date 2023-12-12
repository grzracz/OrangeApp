import { classNames } from 'utils';

type ButtonProps = {
    children?: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
};

function Button({ children, onClick, disabled }: ButtonProps) {
    return (
        <button
            onClick={onClick}
            disabled={disabled}
            className={classNames(
                'heading shadow-lg border border-2 border-black transition-all px-4 py-2 text-2xl rounded-lg',
                disabled ? 'bg-gray-600 cursor-not-allowed opacity-60' : 'bg-yellow-400 hover:bg-yellow-500',
            )}
        >
            {children}
        </button>
    );
}

export default Button;
