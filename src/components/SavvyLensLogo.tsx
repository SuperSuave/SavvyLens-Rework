import React from 'react';

interface SavvyLensLogoProps {
  className?: string;
  size?: number | string;
}

export const SavvyLensLogo: React.FC<SavvyLensLogoProps> = ({
  className = '',
  size = 32
}) => {
  return (
    <img
      src="/SavvyLens-full.svg"
      alt="SavvyLens Logo"
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`shrink-0 select-none object-contain ${className}`}
      draggable={false}
    />
  );
};
