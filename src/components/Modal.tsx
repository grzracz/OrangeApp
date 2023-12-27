import React, { FC } from 'react';
import { classNames } from 'utils';

interface ModalProps {
    open?: boolean;
    onClose?: () => void;
    children?: React.ReactNode;
}

const Modal: FC<ModalProps> = ({ children, open, onClose }) => {
    return (
        <div
            style={{ margin: 0 }}
            className={classNames(
                'fixed left-0 top-0 flex justify-center w-full h-screen items-center bg-black transition-all p-8',
                open ? 'bg-opacity-50 z-40' : 'bg-opacity-0 pointer-events-none',
            )}
            onClick={(event) => {
                event.stopPropagation();
                if (onClose) onClose();
            }}
        >
            {open && (
                <div className="relative" onClick={(event) => event.stopPropagation()}>
                    {children}
                </div>
            )}
        </div>
    );
};

export default Modal;
