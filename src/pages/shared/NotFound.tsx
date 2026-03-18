import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
  }, [location.pathname]);

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <div className="mx-auto flex min-h-[calc(100vh-3rem)] w-full max-w-[1320px] flex-col">
        <div className="flex flex-1 items-center justify-center">
          <div className="w-full max-w-xl rounded-2xl border border-slate-200/60 bg-white px-6 py-12 text-center shadow-[0_18px_45px_-30px_rgba(15,23,42,0.4)]">
            <h1 className="mb-4 text-4xl font-bold text-slate-900">404</h1>
            <p className="mb-4 text-xl text-slate-500">Oops! Page not found</p>
            <Link to="/" className="font-semibold text-sky-700 underline underline-offset-4 hover:text-sky-800">
              Return to Home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NotFound;
