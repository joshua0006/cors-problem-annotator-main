import { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Settings as SettingsIcon, Users } from 'lucide-react';
import Header from './Header';
import { motion } from 'framer-motion';

interface LayoutProps {
  sidebar?: ReactNode;
  children: ReactNode;
}

export default function Layout({ sidebar, children }: LayoutProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen bg-gray-50">
      <Header />
      
      <div className="pt-16 flex">
        {sidebar && (
          <motion.aside
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3 }}
            className="relative w-1/4 min-w-[280px] max-w-sm h-[calc(100vh-4rem)] bg-white border-r border-gray-200"
          >
            {/* Project list container with padding bottom for tabs */}
            <div className="h-full overflow-y-auto pb-16">
              {sidebar}
            </div>

            {/* Fixed bottom tabs */}
            <div className="absolute bottom-0 left-0 w-full bg-white border-t border-gray-200">
              <div className="flex items-center p-4 space-x-2">
                <Link
                  to="/people"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-all duration-300 hover:bg-primary-50 flex-1 justify-center ${
                    location.pathname === '/people' ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:text-primary-600'
                  }`}
                >
                  <Users className="w-5 h-5" />
                  <span>People</span>
                </Link>
                <Link
                  to="/settings"
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-all duration-300 hover:bg-primary-50 flex-1 justify-center ${
                    location.pathname === '/settings' ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:text-primary-600'
                  }`}
                >
                  <SettingsIcon className="w-5 h-5" />
                  <span>Settings</span>
                </Link>
              </div>
            </div>
          </motion.aside>
        )}
        
        <motion.main
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className={`flex-1 h-[calc(100vh-4rem)] overflow-y-auto ${sidebar ? 'w-3/4' : 'w-full'}`}
        >
          {children}
        </motion.main>
      </div>
    </div>
  );
}