import { Link } from "react-router-dom";
import { FiGithub, FiTwitter, FiGlobe, FiMessageCircle } from "react-icons/fi";

const footerLinks = {
  marketplace: [
    { label: "Explore", to: "/explore" },
    { label: "Collections", to: "/explore" },
    { label: "Create", to: "/create" },
    { label: "Activity", to: "/activity" },
  ],
  resources: [
    { label: "Documentation", href: "#" },
    { label: "Smart Contracts", href: "#" },
    { label: "Token Standards", href: "#" },
    { label: "IPFS Storage", href: "#" },
  ],
  community: [
    { label: "Discord", href: "#", icon: FiMessageCircle },
    { label: "Twitter", href: "https://twitter.com", icon: FiTwitter },
    { label: "GitHub", href: "https://github.com", icon: FiGithub },
    { label: "Website", href: "https://www.comp.nus.edu.sg", icon: FiGlobe },
  ],
};

function Footer() {
  return (
    <footer className="border-t border-dark-800/50 bg-dark-950/80 backdrop-blur-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link to="/" className="text-xl font-bold gradient-text">
              NFT Marketplace
            </Link>
            <p className="text-sm text-dark-400 mt-3 leading-relaxed">
              The premier decentralised marketplace for unique digital assets on Ethereum.
            </p>
            <div className="flex items-center gap-3 mt-4">
              {footerLinks.community.map(({ label, href, icon: Icon }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="p-2 rounded-lg text-dark-400 hover:text-primary-400 hover:bg-primary-500/10 transition-all duration-200"
                >
                  <Icon className="w-4 h-4" />
                </a>
              ))}
            </div>
          </div>

          {/* Marketplace */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Marketplace</h4>
            <ul className="space-y-2.5">
              {footerLinks.marketplace.map(({ label, to }) => (
                <li key={label}>
                  <Link to={to} className="text-sm text-dark-400 hover:text-primary-400 transition-colors">
                    {label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Resources</h4>
            <ul className="space-y-2.5">
              {footerLinks.resources.map(({ label, href }) => (
                <li key={label}>
                  <a href={href} className="text-sm text-dark-400 hover:text-primary-400 transition-colors">
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {/* Community */}
          <div>
            <h4 className="text-white font-semibold text-sm mb-4">Community</h4>
            <ul className="space-y-2.5">
              {footerLinks.community.map(({ label, href, icon: Icon }) => (
                <li key={label}>
                  <a href={href} target="_blank" rel="noopener noreferrer" className="text-sm text-dark-400 hover:text-primary-400 transition-colors flex items-center gap-2">
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t border-dark-800/30 flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-dark-500">
            &copy; {new Date().getFullYear()} NFT Marketplace. Built for FT5003 Group 6 Blockchain Innovations.
          </p>
          <p className="text-xs text-dark-600">
            Built with React, Solidity &amp; IPFS
          </p>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
