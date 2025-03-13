import React, { useState, useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { 
  subscribeToNotifications, 
  markNotificationAsRead, 
  markAllNotificationsAsRead,
  Notification 
} from '../services/notificationService';
import { formatDistanceToNow } from 'date-fns';
import NotificationContent from './NotificationContent';

export const NotificationIcon: React.FC = () => {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  
  // Count of unread notifications
  const unreadCount = notifications.filter(n => !n.read).length;
  
  useEffect(() => {
    // Subscribe to notifications collection
    const unsubscribe = subscribeToNotifications((newNotifications) => {
      setNotifications(newNotifications);
      console.log('Received notifications:', newNotifications);
    });
    
    return () => unsubscribe();
  }, []);
  
  // Close notification panel when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (notificationRef.current && !notificationRef.current.contains(event.target as Node)) {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  
  // Handle marking a notification as read and navigate to folder/file
  const handleNotificationClick = async (notification: Notification) => {
    try {
      console.log('Notification clicked:', notification);
      console.log('Navigating to link:', notification.link);
      
      // Mark as read first to ensure this happens regardless of navigation
      if (!notification.read) {
        await markNotificationAsRead(notification.id);
        setNotifications(prev => 
          prev.map(n => 
            n.id === notification.id ? { ...n, read: true } : n
          )
        );
      }
      
      // Close notification panel - do this early in the process
      setShowNotifications(false);
      
      // Navigate to link if provided
      if (notification.link) {
        // Extract the folder ID from the link or from metadata
        let folderId = notification.metadata?.folderId;
        if (!folderId && notification.link.includes('/folders/')) {
          const folderMatch = notification.link.match(/\/folders\/([^\/]+)/);
          if (folderMatch && folderMatch[1]) {
            folderId = folderMatch[1];
          }
        }
        
        // Extract file ID if present in the link
        let fileId;
        if (notification.link.includes('/files/')) {
          const fileMatch = notification.link.match(/\/files\/([^\/]+)/);
          if (fileMatch && fileMatch[1]) {
            fileId = fileMatch[1];
          }
        }
        
        // Extract project ID from metadata if available
        // We need to cast metadata to any for custom fields not in the metadata type
        const projectId = (notification.metadata as any)?.projectId;
        
        // Create comprehensive navigation state
        const navigationState: {
          needsProjectSwitch: boolean;
          targetFolderId?: string;
          targetFileId?: string;
          targetProjectId?: string;
          fromNotification: boolean;
          timestamp: number;
          targetLink?: string;
        } = {
          needsProjectSwitch: true,
          targetFolderId: folderId,
          targetFileId: fileId,
          targetProjectId: projectId,
          fromNotification: true,
          timestamp: Date.now()
        };
        
        // Build the correct target link with project ID
        let targetLink = '/documents';
        
        if (projectId) {
          targetLink = `/documents/projects/${projectId}`;
          
          if (folderId) {
            targetLink += `/folders/${folderId}`;
            
            if (fileId) {
              targetLink += `/files/${fileId}`;
            }
          } else if (fileId) {
            targetLink += `/files/${fileId}`;
          }
        } else {
          // Use original link as fallback if no project ID
          targetLink = notification.link;
        }
        
        // Update navigation state with the correct target link
        navigationState.targetLink = targetLink;
        
        console.log('Navigation state with updated link:', navigationState);
        
        // First navigate to documents to ensure we're in the documents section
        if (!window.location.pathname.startsWith('/documents')) {
          console.log('Navigating to documents section first');
          navigate('/documents', { state: navigationState, replace: true });
        } else {
          // We're already in documents section, update location state and reload
          console.log('Already in documents, updating state with project path');
          
          // Force a reload of the current page with the new state
          navigate(window.location.pathname, { 
            state: navigationState,
            replace: true 
          });
          
          // Add a short timeout before navigating to final destination
          setTimeout(() => {
            console.log('Navigating to final destination:', targetLink);
            navigate(targetLink, { replace: true });
          }, 500); // Increased timeout for safer project switching
        }
      }
    } catch (error) {
      console.error('Error handling notification click:', error);
      // Fallback navigation in case of error
      if (notification.link) {
        navigate(notification.link);
      }
    }
  };
  
  // Handle marking all notifications as read
  const handleMarkAllAsRead = async () => {
    try {
      await markAllNotificationsAsRead();
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
    }
  };
  
  // Format the timestamp
  const formatTime = (timestamp: any) => {
    if (!timestamp) return '';
    
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return formatDistanceToNow(date, { addSuffix: true });
  };
  
  // Get icon class based on notification type
  const getIconClass = (type: string) => {
    switch (type) {
      case 'success':
        return 'bg-green-500';
      case 'info':
        return 'bg-blue-500';
      case 'warning':
        return 'bg-yellow-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };
  
  return (
    <div className="relative" ref={notificationRef}>
      <button
        onClick={() => setShowNotifications(!showNotifications)}
        className="relative p-2 rounded-full transition-colors hover:bg-primary-50"
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5 text-gray-600" />
        
        {/* Notification badge */}
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>
      
      {/* Notification dropdown */}
      <AnimatePresence>
        {showNotifications && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg overflow-hidden border border-gray-200 z-50"
          >
            <div className="flex justify-between items-center p-3 border-b border-gray-200">
              <h3 className="font-semibold text-gray-700">Notifications</h3>
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllAsRead}
                  className="text-xs text-primary-600 hover:text-primary-800"
                >
                  Mark all as read
                </button>
              )}
            </div>
            
            <div className="max-h-96 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="p-4 text-center text-gray-500">
                  No notifications
                </div>
              ) : (
                <ul>
                  {notifications.map((notification) => (
                    <li
                      key={notification.id}
                      className={`p-3 border-b border-gray-100 hover:bg-gray-50 cursor-pointer transition-colors ${
                        !notification.read ? 'bg-blue-50' : ''
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <NotificationContent 
                        notification={notification} 
                        formatTime={formatTime} 
                        getIconClass={getIconClass} 
                      />
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}; 