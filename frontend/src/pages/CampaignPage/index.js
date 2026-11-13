import React, { useEffect, useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../../components/Header';
import Footer from '../../components/Footer';
import { getAllProducts, getCampaignMedia } from '../../services/api';
import VirtualStoreSection from './VirtualStoreSection';
import AccessoriesVaultSection from './AccessoriesVaultSection';
import CampaignVideoSection from './CampaignVideoSection';
import EditorialShowcaseSection from './EditorialShowcaseSection';
import './CampaignPage.css';

const scrollToTargetElement = (el) => {
  if (!el) return;
  const elementPosition = el.getBoundingClientRect().top;
  const offsetPosition = elementPosition + window.pageYOffset - 150;
  window.scrollTo({
    top: offsetPosition,
    behavior: 'smooth',
  });
};

const scrollToProductsSection = () => {
  let attempts = 0;
  const maxAttempts = 60; // Wait up to ~3s for HomePage & ProductGrid to finish loading

  const timer = setInterval(() => {
    attempts += 1;
    const productsSection = document.getElementById('products-section');
    const errorContainer = document.querySelector('#new-arrivals .error-container');

    if (productsSection) {
      clearInterval(timer);
      setTimeout(() => {
        scrollToTargetElement(productsSection);
      }, 60);
    } else if (errorContainer || attempts >= maxAttempts) {
      clearInterval(timer);
      const fallbackSection = document.getElementById('new-arrivals');
      if (fallbackSection) {
        scrollToTargetElement(fallbackSection);
      }
    }
  }, 50);
};

const CampaignPage = ({
  onSearch,
  products = [],
  selectedCategory = 'home',
  onCategoryChange,
  selectedTag = null,
  onSelectTag,
}) => {
  const navigate = useNavigate();
  const [localProducts, setLocalProducts] = useState(products);
  const [campaignMedia, setCampaignMedia] = useState(null);

  useEffect(() => {
    // Fetch campaign media (video & showcase ads)
    getCampaignMedia()
      .then((res) => {
        const data = res?.data?.data || res?.data;
        if (res?.success && data) {
          setCampaignMedia(data);
        }
      })
      .catch((err) => {
        console.warn('Failed to load campaign media:', err);
      });
  }, []);

  useEffect(() => {
    if (products && products.length > 0) {
      setLocalProducts(products);
    } else {
      getAllProducts()
        .then((res) => {
          if (res?.success && Array.isArray(res.data)) {
            setLocalProducts(res.data);
          }
        })
        .catch(() => {});
    }
  }, [products]);

  const handleSearch = (query) => {
    if (onSearch) {
      onSearch(query);
    }
  };

  const handleCategoryChange = (category) => {
    if (onCategoryChange) {
      onCategoryChange(category);
    }

    navigate('/home');

    if (category && category !== 'home') {
      scrollToProductsSection();
    } else {
      setTimeout(() => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }, 50);
    }
  };

  const handleCtaClick = (e) => {
    e.preventDefault();
    if (onCategoryChange) {
      onCategoryChange('all');
    }
    navigate('/home');
    scrollToProductsSection();
  };

  // Handler used by the 3D Virtual Boutique after camera zoom + fade completes
  const handleStoreCategoryNavigate = useCallback(
    (category) => {
      if (onCategoryChange) {
        onCategoryChange(category);
      }
      navigate('/home');
      scrollToProductsSection();
    },
    [navigate, onCategoryChange]
  );

  // Handler used by the 3D Accessories Vault after lid open + camera zoom + fade completes
  const handleAccessoriesNavigate = useCallback(() => {
    if (onCategoryChange) {
      onCategoryChange('accessories');
    }
    navigate('/home');
    scrollToProductsSection();
  }, [navigate, onCategoryChange]);

  // Handler used by the 3D Virtual Boutique Mix & Match center table to transition directly to Fit Lab
  const handleNavigateMixAndMatch = useCallback(() => {
    navigate('/fit-lab');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [navigate]);

  return (
    <div className="campaign-page">
      {/* Reuse existing Header */}
      <Header
        onSearch={handleSearch}
        products={localProducts}
        onCategoryChange={handleCategoryChange}
        selectedCategory={selectedCategory}
        selectedTag={selectedTag}
        onSelectTag={onSelectTag}
      />

      {/* ── 1. Campaign Hero (Kept Intact) ── */}
      <section className="campaign-hero">
        <img
          src="/campaign-hero.jpg"
          alt="AMIRI — Beyond The Ordinary campaign featuring two dark streetwear figures with wings against purple lightning"
          className="campaign-hero__image"
          loading="eager"
          fetchPriority="high"
        />

        <div className="campaign-hero__overlay" />

        <div className="campaign-hero__content">
          <p className="campaign-hero__eyebrow">MADE TRẦN ĐỨC MINH</p>
          <h1 className="campaign-hero__headline">Beyond The Ordinary</h1>
          <p className="campaign-hero__subtext">
            A New Expression of Luxury Streetwear.
          </p>
          <Link
            to="/home"
            className="campaign-hero__cta"
            onClick={handleCtaClick}
          >
            Discover New Arrivals
          </Link>
        </div>

        {/* Subtle scroll indicator */}
        <div className="campaign-hero__scroll">
          <div className="campaign-hero__scroll-line" />
        </div>
      </section>

      {/* ── 2. Cinematic Video Section (AMIRI Winter Capsule Inspired) ── */}
      <CampaignVideoSection videoData={campaignMedia?.video} />

      {/* ── 3. Interactive 3D Fashion Boutique Section ── */}
      <VirtualStoreSection 
        onSelectCategory={handleStoreCategoryNavigate}
        onNavigateMixAndMatch={handleNavigateMixAndMatch}
      />

      {/* ── 4. Editorial Showcase: Couple Outfit & Outfit with Homie ── */}
      <EditorialShowcaseSection 
        showcaseLeft={campaignMedia?.showcaseLeft}
        showcaseRight={campaignMedia?.showcaseRight}
      />

      {/* ── 5. Interactive 3D Accessories Vault Section ── */}
      <AccessoriesVaultSection onNavigateAccessories={handleAccessoriesNavigate} />

      {/* ── 4. Future Campaign Sections Placeholder ── */}

      <Footer />
    </div>
  );
};

export default CampaignPage;
