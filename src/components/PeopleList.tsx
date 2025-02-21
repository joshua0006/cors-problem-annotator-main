import React, { useState, useEffect } from "react";
import { Users, Loader2 } from "lucide-react";
import { Project } from "../types";
import { User } from "../types/auth";
import { motion, AnimatePresence } from "framer-motion";
import { userService } from "../services/userService";
import { formatDateToTimezone } from "../utils/dateUtils";
import { useOrganization } from "../contexts/OrganizationContext";
import { useNavigate, useLocation } from "react-router-dom";

interface PeopleListProps {
  projects: Project[];
}

interface ProjectsPopupProps {
  projects: Array<{ id: string; name: string; details?: string }>;
  onClose: () => void;
  onSelectProject: (projectId: string) => void;
}

const ProjectsPopup = ({
  projects,
  onClose,
  onSelectProject,
}: ProjectsPopupProps) => (
  <motion.div
    initial={{ opacity: 0, scale: 0.95 }}
    animate={{ opacity: 1, scale: 1 }}
    exit={{ opacity: 0, scale: 0.95 }}
    className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
    onClick={onClose}
  >
    <div
      className="bg-white rounded-lg p-6 max-w-md w-full max-h-[80vh] overflow-y-auto m-4"
      onClick={(e) => e.stopPropagation()}
    >
      <h3 className="text-lg font-semibold mb-4">Project Involvement</h3>
      <div className="space-y-2">
        {projects.map((project) => (
          <button
            key={project.id}
            onClick={() => onSelectProject(project.id)}
            className="w-full text-left p-3 bg-gray-50 rounded-md hover:bg-gray-100 transition-colors cursor-pointer"
          >
            <div className="font-medium">{project.name}</div>
            {project.details && (
              <div className="text-sm text-gray-600 mt-1">{project.details}</div>
            )}
          </button>
        ))}
      </div>
      <button
        onClick={onClose}
        className="mt-4 w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
      >
        Close
      </button>
    </div>
  </motion.div>
);

export default function PeopleList({ projects }: PeopleListProps) {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { settings } = useOrganization();
  const [selectedUserProjects, setSelectedUserProjects] = useState<Array<{
    id: string;
    name: string;
    details?: string;
  }> | null>(null);
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const fetchedUsers = await userService.getAllUsers();
      setUsers(fetchedUsers);
      setError(null);
    } catch (error) {
      setError("Failed to load users");
      console.error("Error loading users:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleProjectSelect = (projectId: string) => {
    // Find the selected project to ensure it exists
    const selectedProject = projects.find((p) => p.id === projectId);
    if (!selectedProject) {
      console.error("Project not found:", projectId);
      return;
    }

    // Close the popup
    setSelectedUserProjects(null);

    // Navigate to the project view with the selected project ID
    if (location.pathname === '/') {
      // If already on the project page, just update the state
      navigate('/', {
        replace: true,
        state: { selectedProjectId: projectId },
      });
    } else {
      // If on a different page, navigate to the project page
      navigate('/', {
        state: { 
          fromPath: location.pathname,
          selectedProjectId: projectId 
        },
      });
    }
  };

  // Group users by role and sort within groups
  const groupedUsers = React.useMemo(() => {
    const groups = {
      Staff: [] as User[],
      Client: [] as User[],
      Contractor: [] as User[],
    };

    users.forEach((user) => {
      if (user.role in groups) {
        groups[user.role as keyof typeof groups].push(user);
      }
    });

    // Sort each group by name
    Object.keys(groups).forEach((role) => {
      groups[role as keyof typeof groups].sort((a, b) =>
        a.displayName.localeCompare(b.displayName)
      );
    });

    return groups;
  }, [users]);

  const getTypeColor = (role: keyof typeof groupedUsers) => {
    switch (role) {
      case "Staff":
        return "bg-blue-100 text-blue-800";
      case "Client":
        return "bg-green-100 text-green-800";
      case "Contractor":
        return "bg-purple-100 text-purple-800";
    }
  };

  const getProjectNames = (projectIds: string[]) => {
    const projectNames = projectIds
      .map((id) => projects.find((p) => p.id === id)?.name)
      .filter(Boolean) as string[];

    if (projectNames.length <= 2) {
      return projectNames.join(", ");
    }

    return `${projectNames[0]}, ${projectNames[1]} +${projectNames.length - 2}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center space-x-2 text-gray-500">
          <Loader2 className="w-6 h-6 animate-spin" />
          <span>Loading users...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-red-600">{error}</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="flex items-center space-x-2 mb-6">
        <Users className="w-6 h-6 text-gray-700" />
        <h2 className="text-xl font-semibold text-gray-900">People</h2>
      </div>

      <div className="space-y-8">
        {(Object.keys(groupedUsers) as Array<keyof typeof groupedUsers>).map(
          (role) => (
            <motion.div
              key={role}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-4"
            >
              <div className="flex items-center space-x-2">
                <span
                  className={`inline-block px-3 py-1 text-sm rounded-full ${getTypeColor(
                    role
                  )}`}
                >
                  {role}
                </span>
                <span className="text-sm text-gray-500">
                  ({groupedUsers[role].length})
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {groupedUsers[role].map((user) => (
                  <motion.div
                    key={user.id}
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="p-4 bg-white border border-gray-200 rounded-lg shadow-sm"
                  >
                    <div className="flex items-start space-x-4">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                          {user.profile?.photoURL ? (
                            <img
                              src={user.profile.photoURL}
                              alt={user.displayName}
                              className="w-full h-full rounded-full object-cover"
                            />
                          ) : (
                            <span className="text-xl font-semibold text-gray-400">
                              {user.displayName[0].toUpperCase()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-gray-900 truncate">
                          {user.displayName}
                        </h3>
                        {user.profile?.title && (
                          <p className="text-sm text-gray-500">
                            {user.profile.title}
                          </p>
                        )}
                        <div className="mt-2 space-y-1 text-xs text-gray-500">
                          <p>{user.email}</p>
                          {user.profile?.phone && <p>{user.profile.phone}</p>}
                          {user.profile?.location && (
                            <p>{user.profile.location}</p>
                          )}
                        </div>
                        {user.projectIds?.length > 0 && (
                          <div className="mt-2 text-xs text-gray-500">
                            <button
                              onClick={() =>
                                setSelectedUserProjects(
                                  user.projectIds
                                    .map((id) => {
                                      const project = projects.find(
                                        (p) => p.id === id
                                      );
                                      return project
                                        ? {
                                            id: project.id,
                                            name: project.name,
                                            details:
                                              project.description ||
                                              project.status ||
                                              undefined,
                                          }
                                        : null;
                                    })
                                    .filter(Boolean) as Array<{
                                    id: string;
                                    name: string;
                                    details?: string;
                                  }>
                                )
                              }
                              className="font-medium text-blue-500 hover:text-blue-600 transition-colors"
                            >
                              Projects Involved
                            </button>
                          </div>
                        )}
                        <p className="mt-2 text-xs text-gray-400">
                          Last active:{" "}
                          {user.metadata?.lastLogin
                            ? formatDateToTimezone(
                                user.metadata.lastLogin.toDate(),
                                settings.timezone
                              )
                            : "Never"}
                        </p>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              {groupedUsers[role].length === 0 && (
                <p className="text-center text-gray-500 py-4">
                  No {role.toLowerCase()} members found
                </p>
              )}
            </motion.div>
          )
        )}
      </div>

      <AnimatePresence>
        {selectedUserProjects && (
          <ProjectsPopup
            projects={selectedUserProjects}
            onClose={() => setSelectedUserProjects(null)}
            onSelectProject={handleProjectSelect}
          />
        )}
      </AnimatePresence>
    </div>
  );
}