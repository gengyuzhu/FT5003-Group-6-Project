import Navbar from "./Navbar";
import Footer from "./Footer";

function Layout({ children }) {
  return (
    <div className="min-h-screen bg-dark-950 text-white flex flex-col">
      <Navbar />
      {/* pt-16 md:pt-20 offsets the fixed navbar height */}
      <main className="flex-1 pt-16 md:pt-20">{children}</main>
      <Footer />
    </div>
  );
}

export default Layout;
