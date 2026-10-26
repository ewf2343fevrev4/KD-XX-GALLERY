import React, { useRef, useState, useEffect, useCallback } from 'react';
import vid1Asset from '../../assets/vid1.mp4';
import './CampaignVideoSection.css';

/**
 * CampaignVideoSection
 * Full-width cinematic editorial fashion video section (inspired by AMIRI Winter Capsule).
 * Autoplays muted on loop with center luxury play/pause button and bottom-left editorial typography.
 */
const CampaignVideoSection = ({ videoData }) => {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const isPlayingRef = useRef(true);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);

  const activeVideoUrl = videoData?.videoUrl || vid1Asset;
  const activeTitle = videoData?.title || 'WINTER CAPSULE';
  const activeDescription = videoData?.description || "Winter in Runyon Canyon, set against the iconic backdrop of Los Angeles.\nBringing a sophisticated ease to cold-weather essentials, the Winter Capsule unites function and form through the house's signature craftsmanship.";

  // Handle play/pause toggle
  const togglePlay = useCallback((e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const video = videoRef.current;
    if (!video) return;

    if (video.paused) {
      video
        .play()
        .then(() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
        })
        .catch((err) => {
          console.warn('Playback error:', err);
          setIsPlaying(false);
          isPlayingRef.current = false;
        });
    } else {
      video.pause();
      setIsPlaying(false);
      isPlayingRef.current = false;
    }
  }, []);

  // Sync state with native video play/pause events & attempt initial autoplay
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => {
      setIsPlaying(true);
      isPlayingRef.current = true;
    };
    const onPause = () => {
      setIsPlaying(false);
      isPlayingRef.current = false;
    };
    const onLoadedData = () => setIsLoaded(true);

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('loadeddata', onLoadedData);

    // Initial attempt to autoplay (muted is mandatory for browser policy)
    video.muted = true;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          setIsPlaying(true);
          isPlayingRef.current = true;
        })
        .catch(() => {
          setIsPlaying(false);
          isPlayingRef.current = false;
        });
    }

    return () => {
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('loadeddata', onLoadedData);
    };
  }, []);

  // Pause playback when scrolled far out of viewport to optimize performance
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !window.IntersectionObserver) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const video = videoRef.current;
          if (!video) return;

          if (!entry.isIntersecting) {
            if (!video.paused) {
              video.pause();
            }
          } else {
            // Only resume if user has not explicitly clicked pause
            if (isPlayingRef.current && video.paused) {
              video.play().catch(() => {});
            }
          }
        });
      },
      { threshold: 0.05 }
    );

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <section 
      ref={containerRef} 
      className="campaign-video-section"
      id="campaign-video"
      aria-label="KD-XX Winter Capsule Video"
    >
      {/* ── Background Video Element ── */}
      <video
        ref={videoRef}
        key={activeVideoUrl}
        className={`campaign-video__element ${isLoaded ? 'is-loaded' : ''}`}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onClick={togglePlay}
      >
        <source src={activeVideoUrl} type="video/mp4" />
        <source src={vid1Asset} type="video/mp4" />
        <source src="/assets/vid1.mp4" type="video/mp4" />
        Your browser does not support the video tag.
      </video>

      {/* ── Cinematic Vignette & Bottom Text Contrast Gradient ── */}
      <div className="campaign-video__overlay" onClick={togglePlay} />

      {/* ── Center Play / Pause Glass Button (AMIRI Editorial Style) ── */}
      <button
        type="button"
        className={`campaign-video__play-btn ${isPlaying ? 'is-playing' : 'is-paused'}`}
        onClick={togglePlay}
        aria-label={isPlaying ? 'Tạm dừng video' : 'Tiếp tục phát video'}
        title={isPlaying ? 'Dừng video' : 'Phát video'}
      >
        {isPlaying ? (
          <span className="campaign-video__pause-icon" aria-hidden="true">
            <span className="campaign-video__pause-bar" />
            <span className="campaign-video__pause-bar" />
          </span>
        ) : (
          <span className="campaign-video__play-icon" aria-hidden="true" />
        )}
      </button>

      {/* ── Bottom-Left Editorial Campaign Title & Storytelling ── */}
      <div className="campaign-video__info">
        <h2 className="campaign-video__title">{activeTitle}</h2>
        <p className="campaign-video__description" style={{ whiteSpace: 'pre-line' }}>
          {activeDescription}
        </p>
      </div>
    </section>
  );
};

export default CampaignVideoSection;

