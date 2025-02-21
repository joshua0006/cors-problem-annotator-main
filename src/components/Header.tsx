import { Building2, FileText, ListTodo, Users, LogOut, Settings as SettingsIcon } from 'lucide-react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useOrganization } from '../contexts/OrganizationContext';
import { useAuth } from '../contexts/AuthContext';
import { motion, AnimatePresence } from 'framer-motion';
import { useState, useRef, useEffect } from 'react';

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const { settings } = useOrganization();
  const { user, signOut } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  
  const isActive = (path: string) => location.pathname === path;

  const handleProjectClick = () => {
    if (location.pathname === '/') {
      navigate('/', { replace: true, state: { resetFolder: true } });
    } else {
      navigate('/');
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      navigate('/signin');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setShowUserMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { path: '/', icon: Building2, label: 'Project', onClick: handleProjectClick },
    { path: '/team', icon: Users, label: 'Team' },
    { path: '/documents', icon: FileText, label: 'Documents' },
    { path: '/tasks', icon: ListTodo, label: 'Tasks' },
  ];
  
  return (
    <header className="fixed top-0 left-0 right-0 h-16 glass-effect z-50">
      <div className="h-full  mx-auto px-4 flex items-center justify-between">
        <motion.div 
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          className="flex items-center space-x-2"
        >
          <Building2 className="w-8 h-8 text-primary-600" />
          <span className="text-xl font-semibold text-gradient">{settings.name}</span>
        </motion.div>
        
        <div className="flex items-center space-x-8">
          <nav className="flex items-center space-x-8">
            {navItems.map((item, index) => {
              const Icon = item.icon;
              const isActiveRoute = isActive(item.path);
              
              return (
                <motion.div
                  key={item.path}
                  initial={{ opacity: 0, y: -20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                >
                  {item.onClick ? (
                    <button
                      onClick={item.onClick}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-all duration-300 hover:bg-primary-50 ${
                        isActiveRoute ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:text-primary-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </button>
                  ) : (
                    <Link
                      to={item.path}
                      className={`flex items-center space-x-2 px-3 py-2 rounded-md transition-all duration-300 hover:bg-primary-50 ${
                        isActiveRoute ? 'bg-primary-50 text-primary-600' : 'text-gray-600 hover:text-primary-600'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.label}</span>
                    </Link>
                  )}
                </motion.div>
              );
            })}
          </nav>

          {/* User Menu */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              className="flex items-center space-x-2 px-3 py-2 rounded-md transition-all duration-300 hover:bg-primary-50 text-gray-600 hover:text-primary-600"
            >
              {user?.profile?.photoURL ? (
                <img
                  src={user.profile.photoURL}
                  alt={user.displayName}
                  className="w-8 h-8 rounded-full object-cover"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-primary-100 flex items-center justify-center">
                  <span className="text-sm font-medium text-primary-600">
                    {user?.displayName?.[0].toUpperCase()}
                  </span>
                </div>
              )}
              <span className="text-sm font-medium">{user?.displayName}</span>
            </button>

            <AnimatePresence>
              {showUserMenu && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="absolute right-0 mt-2 w-48 bg-white rounded-lg shadow-lg py-1 border border-gray-200"
                >
                  <Link
                    to="/account"
                    onClick={() => setShowUserMenu(false)}
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <SettingsIcon className="w-4 h-4" />
                    <span>Account Settings</span>
                  </Link>
                  <button
                    onClick={handleSignOut}
                    className="flex items-center space-x-2 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors w-full"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </header>
  );
}