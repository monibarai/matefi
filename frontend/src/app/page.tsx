import Hero from '@/components/landing/Hero';
import PixelDivider from '@/components/landing/PixelDivider';
import BuiltOn from '@/components/landing/BuiltOn';
import Features from '@/components/landing/Features';
import HowItWorks from '@/components/landing/HowItWorks';
import Stats from '@/components/landing/Stats';
import Proof from '@/components/landing/Proof';
import Bento from '@/components/landing/Bento';
import Comparison from '@/components/landing/Comparison';
import FAQ from '@/components/landing/FAQ';
import Fees from '@/components/landing/Fees';
import FinalCTA from '@/components/landing/FinalCTA';

export default function LandingPage() {
  return (
    <div className="relative left-1/2 right-1/2 -mx-[50vw] flex w-screen flex-col bg-ink">
      <Hero />
      <PixelDivider />
      <BuiltOn />
      <Features />
      <HowItWorks />
      <Stats />
      <Proof />
      <Bento />
      <Comparison />
      <FAQ />
      <Fees />
      <FinalCTA />
    </div>
  );
}
