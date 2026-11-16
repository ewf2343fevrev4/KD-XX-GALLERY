import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import PhotoUploader from './PhotoUploader';

describe('KD-XX Level 1 — PhotoUploader Pose & Anatomical Integrity UI', () => {
  const mockToken = 'mock-jwt-token';

  it('renders pose analysis widget with 3 zones when poseAnalysis is present', () => {
    const mockPhotoWithPose = {
      assetId: 'asset-pose-1',
      previewUrl: '/api/tryon/images/sample-pose',
      qualityAnalysis: {
        status: 'READY',
        score: 95,
        issues: [],
        suggestions: ['Tư thế đứng chuẩn vàng.'],
        poseAnalysis: {
          isFullBodyDetected: true,
          poseScore: 94,
          zones: {
            upper: { status: 'PASSED', label: 'Đầu & Vai' },
            middle: { status: 'PASSED', label: 'Ngực & Thân trên' },
            lower: { status: 'PASSED', label: 'Hông, Chân & Mắt cá' }
          },
          recommendations: ['Tư thế đứng toàn thân đạt chuẩn vàng cho Full Outfit!']
        }
      }
    };

    render(
      <PhotoUploader
        uploadedPhoto={mockPhotoWithPose}
        onPhotoUploaded={jest.fn()}
        onPhotoRemoved={jest.fn()}
        token={mockToken}
        tryOnMode="full_outfit"
      />
    );

    expect(screen.getByTestId('vto-pose-analysis-widget')).toBeInTheDocument();
    expect(screen.getByText(/Toàn Thân \(Full Body\)/i)).toBeInTheDocument();
    expect(screen.getByText('✓ Cân đối')).toBeInTheDocument();
    expect(screen.getByText('✓ Rõ ràng')).toBeInTheDocument();
    expect(screen.getByText('✓ Toàn thân')).toBeInTheDocument();
    expect(screen.queryByTestId('vto-half-body-fulloutfit-warning')).not.toBeInTheDocument();
  });

  it('renders smart switcher warning when half-body is uploaded in full_outfit mode', () => {
    const mockHalfBodyPhoto = {
      assetId: 'asset-half-1',
      previewUrl: '/api/tryon/images/sample-half',
      qualityAnalysis: {
        status: 'READY',
        score: 80,
        issues: [],
        suggestions: [],
        poseAnalysis: {
          isFullBodyDetected: false,
          poseScore: 55,
          zones: {
            upper: { status: 'PASSED', label: 'Đầu & Vai' },
            middle: { status: 'PASSED', label: 'Ngực & Thân trên' },
            lower: { status: 'FAILED', label: 'Hông, Chân & Mắt cá' }
          },
          recommendations: [
            'Ảnh chưa thấy rõ vùng chân và mắt cá chân. Hãy lùi lại để lấy ảnh toàn thân từ đầu đến chân.'
          ]
        }
      }
    };

    const mockSwitchMode = jest.fn();

    render(
      <PhotoUploader
        uploadedPhoto={mockHalfBodyPhoto}
        onPhotoUploaded={jest.fn()}
        onPhotoRemoved={jest.fn()}
        token={mockToken}
        tryOnMode="full_outfit"
        onSwitchMode={mockSwitchMode}
      />
    );

    expect(screen.getByTestId('vto-pose-analysis-widget')).toBeInTheDocument();
    expect(screen.getByText(/Nửa Người \(Half Body\)/i)).toBeInTheDocument();
    expect(screen.getByText('❌ Bị cắt cụt')).toBeInTheDocument();

    const warningBanner = screen.getByTestId('vto-half-body-fulloutfit-warning');
    expect(warningBanner).toBeInTheDocument();
    expect(warningBanner).toHaveTextContent(/Ảnh này thiếu phần chân/i);

    const switchBtn = screen.getByRole('button', { name: /Chuyển sang Thử 1 Món/i });
    fireEvent.click(switchBtn);
    expect(mockSwitchMode).toHaveBeenCalledWith('single');
  });
});
