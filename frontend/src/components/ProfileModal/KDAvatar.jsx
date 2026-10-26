import React from 'react';
import defaultAvatarImg from '../../assets/default-avatar.png';

/**
 * KDAvatar - Default User Profile Avatar
 * Displays the high-resolution gradient ring avatar as specified by user.
 */
const KDAvatar = ({ size = 88, className = '' }) => {
  return (
    <img
      src={defaultAvatarImg}
      alt="Profile Avatar"
      width={size}
      height={size}
      className={`kd-avatar-img ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'block',
      }}
      loading="eager"
    />
  );
};

export default KDAvatar;
