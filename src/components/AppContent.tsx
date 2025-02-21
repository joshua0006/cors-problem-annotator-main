import React, { useState, useEffect } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { OrganizationProvider } from '../contexts/OrganizationContext';
import { AnimatePresence } from 'framer-motion';
import Layout from './Layout';
import ProjectDetails from './ProjectDetails';
import ProjectList from './ProjectList';
import PeopleList from './PeopleList';
import DocumentList from './DocumentList';
import Settings from './Settings';
import TeamList from './TeamList';
import TaskList from './TaskList';
import AccountSettings from './AccountSettings';
import { Project } from '../types';
import { projectService } from '../services';
import { sampleTasks, sampleTeamMembers } from '../data/sampleData';
import { useDocumentManager } from '../hooks/useDocumentManager';
import { useFolderManager } from '../hooks/useFolderManager';
import { useTaskManager } from '../hooks/useTaskManager';
import { useTeamManager } from '../hooks/useTeamManager';

export default function AppContent() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedProject, setSelectedProject] = useState<Project | undefined>();
  const [currentFolderId, setCurrentFolderId] = useState<string | undefined>();
  const location = useLocation();
  const navigate = useNavigate();
  
  const {
    documents,
    loading: documentsLoading,
    error: documentsError,
    createDocument,
    updateDocument,
    updateDocumentFile,
    deleteDocument,
    setCurrentFolderId: setDocumentManagerFolderId
  } = useDocumentManager(selectedProject?.id || '');

  const {
    folders,
    loading: foldersLoading,
    error: foldersError,
    createFolder,
    updateFolder,
    deleteFolder,
  } = useFolderManager(selectedProject?.id || '');
  
  const {
    tasks,
    createTask,
    updateTask,
    deleteTask,
  } = useTaskManager(sampleTasks);
  
  const {
    teamMembers,
    createTeamMember,
    updateTeamMember,
    deleteTeamMember,
    assignToProject,
    removeFromProject,
  } = useTeamManager(sampleTeamMembers);

  const loadProjects = async () => {
    try {
      const fetchedProjects = await projectService.getAll();
      setProjects(fetchedProjects);
      
      // Handle project selection from navigation state
      const state = location.state as { selectedProjectId?: string };
      if (state?.selectedProjectId) {
        const project = fetchedProjects.find(p => p.id === state.selectedProjectId);
        if (project) {
          setSelectedProject(project);
          // Clear the state to prevent reselection on subsequent renders
          navigate(location.pathname, { replace: true, state: {} });
        }
      }
      // If we're on the documents page and no project is selected,
      // select the first project
      else if (location.pathname === '/documents' && !selectedProject && fetchedProjects.length > 0) {
        setSelectedProject(fetchedProjects[0]);
      }

      // Update selected project if it exists in the fetched projects
      if (selectedProject) {
        const updatedProject = fetchedProjects.find(p => p.id === selectedProject.id);
        if (updatedProject) {
          setSelectedProject(updatedProject);
        }
      }
    } catch (error) {
      console.error('Error loading projects:', error);
    }
  };

  useEffect(() => {
    loadProjects();
  }, []);

  // Reset folder selection when project changes
  useEffect(() => {
    setCurrentFolderId(undefined);
    setDocumentManagerFolderId(undefined);
  }, [selectedProject, setDocumentManagerFolderId]);

  const handleUpdateProject = async (id: string, updates: Partial<Project>) => {
    try {
      await projectService.update(id, updates);
      await loadProjects(); // Reload projects to get updated data
    } catch (error) {
      console.error('Error updating project:', error);
    }
  };

  const handleFolderSelect = (folder?: Folder) => {
    const newFolderId = folder?.id;
    setCurrentFolderId(newFolderId);
    setDocumentManagerFolderId(newFolderId);
  };

  return (
    <AnimatePresence mode="wait">
      <Routes>
        <Route
          path="/"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              {selectedProject ? (
                <ProjectDetails 
                  project={selectedProject}
                  tasks={tasks.filter(t => t.projectId === selectedProject.id)}
                  onProjectUpdate={loadProjects}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Select a project to view details
                </div>
              )}
            </Layout>
          }
        />
        
        <Route
          path="/team"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              <TeamList
                teamMembers={teamMembers.filter(m => selectedProject ? m.projectIds.includes(selectedProject.id) : false)}
                projects={projects}
                selectedProject={selectedProject}
              />
            </Layout>
          }
        />
        
        <Route
          path="/people"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              <PeopleList
                teamMembers={teamMembers}
                projects={projects}
                onCreateMember={createTeamMember}
                onUpdateMember={updateTeamMember}
                onDeleteMember={deleteTeamMember}
                onAssignToProject={assignToProject}
                onRemoveFromProject={removeFromProject}
              />
            </Layout>
          }
        />
        
        <Route
          path="/documents"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              {selectedProject ? (
                <DocumentList
                  documents={documents || []}
                  folders={folders || []}
                  currentFolder={folders?.find(f => f.id === currentFolderId)}
                  projectId={selectedProject.id}
                  onFolderSelect={handleFolderSelect}
                  onPreview={(doc) => console.log('Preview document:', doc)}
                  onCreateFolder={createFolder}
                  onCreateDocument={createDocument}
                  onUpdateFolder={updateFolder}
                  onDeleteFolder={deleteFolder}
                  onUpdateDocument={updateDocument}
                  onDeleteDocument={deleteDocument}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Select a project to view documents
                </div>
              )}
            </Layout>
          }
        />
        
        <Route
          path="/tasks"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              {selectedProject ? (
                <TaskList
                  tasks={tasks.filter(t => t.projectId === selectedProject.id)}
                  teamMembers={teamMembers.filter(m => m.projectIds.includes(selectedProject.id))}
                  projectId={selectedProject.id}
                  onCreateTask={createTask}
                  onStatusChange={(taskId, status) => updateTask(taskId, { status })}
                  onUpdateTask={updateTask}
                  onDeleteTask={deleteTask}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  Select a project to view tasks
                </div>
              )}
            </Layout>
          }
        />
        
        <Route
          path="/settings"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              <Settings 
                projects={projects}
                onUpdateProject={handleUpdateProject}
              />
            </Layout>
          }
        />

        <Route
          path="/account"
          element={
            <Layout
              sidebar={
                <ProjectList
                  projects={projects}
                  selectedId={selectedProject?.id}
                  onSelect={setSelectedProject}
                  onProjectsChange={loadProjects}
                  onUpdateProject={handleUpdateProject}
                  tasks={tasks}
                />
              }
            >
              <AccountSettings />
            </Layout>
          }
        />
      </Routes>
    </AnimatePresence>
  );
}