// src/components/course/FileManager.tsx - VERSIÓN MODERNA Y JUVENIL
import { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Eye, 
  X, 
  Search,
  User,
  Loader2,
  FolderOpen,
  ChevronRight,
  File,
  FileSpreadsheet,
  FileImage,
  Film,
  Music,
  Archive,
  Globe,
  Lock,
  ExternalLink,
  Maximize2,
  Share2,
  BookOpen,
  Calendar,
  Clock,
  Tag,
  Filter,
  Grid,
  List,
  Star,
  Bookmark
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';

interface CourseFile {
  id: string;
  name: string;
  url: string;
  size: number;
  type: string;
  uploadedBy: string;
  uploadedAt: Date;
  courseId: string;
  description?: string;
  isPublic?: boolean;
  category?: string;
  tags?: string[];
}

interface FileManagerProps {
  courseId: string;
  isTeacher: boolean;
}

const FileManager = ({ courseId, isTeacher }: FileManagerProps) => {
  const { user } = useAuth();
  const [files, setFiles] = useState<CourseFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState(''); 
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<CourseFile | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Archivos de ejemplo con PDFs reales
  const sampleFiles: CourseFile[] = [
    {
      id: 'file-1',
      name: '100 Verbs in English',
      url: '/pdf/100-verbs.pdf',
      size: 119000,
      type: 'application/pdf',
      uploadedBy: 'Roberto Román',
      uploadedAt: new Date('2026-02-01'),
      courseId: courseId,
      description: 'Complete list of 100 essential English verbs with Spanish translations, conjugations, and example sentences.',
      isPublic: true,
      category: 'grammar',
      tags: ['verbs', 'vocabulary', 'essential']
    },
    {
      id: 'file-2',
      name: 'The Elephant Man - Full Story',
      url: '/pdf/the-elephant-man.pdf',
      size: 430000,
      type: 'application/pdf',
      uploadedBy: 'Roberto Román',
      uploadedAt: new Date('2026-02-01'),
      courseId: courseId,
      description: 'The classic short story "The Elephant Man" by H.G. Wells with vocabulary notes and reading comprehension questions.',
      isPublic: true,
      category: 'literature',
      tags: ['short story', 'literature', 'reading']
    },
  ];

  // Categorías disponibles
  const categories = [
    { id: 'all', name: 'All Files', icon: <FileText className="h-4 w-4" />, count: sampleFiles.length },
    { id: 'pdf', name: 'PDF Documents', icon: <FileText className="h-4 w-4" />, count: sampleFiles.filter(f => f.type.includes('pdf')).length },
    { id: 'grammar', name: 'Grammar', icon: <BookOpen className="h-4 w-4" />, count: sampleFiles.filter(f => f.category === 'grammar').length },
    { id: 'literature', name: 'Literature', icon: <BookOpen className="h-4 w-4" />, count: sampleFiles.filter(f => f.category === 'literature').length },
  ];

  // Cargar archivos
  useEffect(() => {
    loadFiles();
  }, [courseId]);

  const loadFiles = async () => {
    setLoading(true);
    try {
      // Simular carga de archivos
      setTimeout(() => {
        setFiles(sampleFiles);
        setLoading(false);
      }, 800);
    } catch (error) {
      console.error('Error loading files:', error);
      setFiles(sampleFiles);
      setLoading(false);
    }
  };

  const filteredFiles = files.filter(file => {
    const matchesSearch = file.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      file.tags?.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    
    const matchesCategory = selectedCategory === 'all' || 
      (selectedCategory === 'pdf' && file.type.includes('pdf')) ||
      file.category === selectedCategory;
    
    return matchesSearch && matchesCategory;
  });

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (type: string) => {
    if (type.includes('pdf')) return <FileText className="h-6 w-6" />;
    if (type.includes('word')) return <File className="h-6 w-6" />;
    if (type.includes('excel')) return <FileSpreadsheet className="h-6 w-6" />;
    if (type.includes('image')) return <FileImage className="h-6 w-6" />;
    if (type.includes('video')) return <Film className="h-6 w-6" />;
    if (type.includes('audio')) return <Music className="h-6 w-6" />;
    if (type.includes('zip')) return <Archive className="h-6 w-6" />;
    return <File className="h-6 w-6" />;
  };

  const getFileColor = (type: string) => {
    if (type.includes('pdf')) return "bg-gradient-to-br from-red-500 to-orange-500";
    if (type.includes('word')) return "bg-gradient-to-br from-blue-500 to-cyan-500";
    if (type.includes('excel')) return "bg-gradient-to-br from-green-500 to-emerald-500";
    if (type.includes('image')) return "bg-gradient-to-br from-purple-500 to-pink-500";
    if (type.includes('video')) return "bg-gradient-to-br from-indigo-500 to-blue-500";
    return "bg-gradient-to-br from-gray-500 to-gray-700";
  };

  const handlePreview = (file: CourseFile) => {
    setSelectedFile(file);
    setShowPreviewModal(true);
  };

  const handleDownload = async (file: CourseFile) => {
    try {
      const link = document.createElement('a');
      link.href = file.url;
      link.download = file.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading file:', error);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  };

  const formatTimeAgo = (date: Date) => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return formatDate(date);
  };

  // Toggle fullscreen
  const toggleFullscreen = () => {
    const iframe = document.querySelector('#pdf-iframe');
    if (iframe) {
      if (!document.fullscreenElement) {
        iframe.requestFullscreen();
        setIsFullscreen(true);
      } else {
        document.exitFullscreen();
        setIsFullscreen(false);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <div className="h-20 w-20 mx-auto rounded-2xl bg-gradient-to-br from-blue-100 to-cyan-100 flex items-center justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
          </div>
          <div className="space-y-2">
            <p className="text-lg font-bold text-gray-900">Loading Course Materials</p>
            <p className="text-sm text-gray-500">Fetching all available files and resources</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header con controles */}
      <div className="bg-white border border-gray-100 rounded-2xl p-6 shadow-sm hidden sm:block">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search files by name, description, or tags..."
                className="w-full pl-12 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all text-sm font-medium"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-4 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-3 ">
            <div className="flex items-center gap-2 bg-gray-50 rounded-xl p-1">
              <button
                onClick={() => setViewMode('grid')}
                className={cn(
                  "p-2 rounded-lg transition-all duration-300",
                  viewMode === 'grid' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
                )}
                title="Grid view"
              >
                <Grid className="h-5 w-5" />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "p-2 rounded-lg transition-all duration-300",
                  viewMode === 'list' ? "bg-white shadow-sm text-blue-600" : "text-gray-500 hover:text-gray-700"
                )}
                title="List view"
              >
                <List className="h-5 w-5" />
              </button>
            </div>
            
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <select
                className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all appearance-none text-sm font-medium"
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
              >
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name} ({cat.count})
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Categorías */}
        <div className="flex flex-wrap gap-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all duration-300",
                selectedCategory === cat.id
                  ? "bg-gradient-to-r from-blue-500 to-cyan-500 text-white shadow-lg"
                  : "bg-gray-50 text-gray-700 hover:bg-gray-100 border border-gray-200"
              )}
            >
              <div className={cn(
                "flex items-center justify-center",
                selectedCategory === cat.id ? "text-white" : "text-gray-500"
              )}>
                {cat.icon}
              </div>
              <span className="text-sm font-medium">{cat.name}</span>
              <span className={cn(
                "text-xs font-bold px-1.5 py-0.5 rounded-full",
                selectedCategory === cat.id 
                  ? "bg-white/20 text-white" 
                  : "bg-gray-200 text-gray-700"
              )}>
                {cat.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Información de archivos */}
      <div className="flex items-center justify-between">
        <div className=' hidden sm:block'>
          <h2 className="text-2xl font-bold text-gray-900">Course Materials</h2>
          <div className="flex items-center gap-3 mt-2">
            <p className="text-gray-600">
              <span className="font-bold text-gray-900">{filteredFiles.length}</span> {filteredFiles.length === 1 ? 'file available' : 'files available'}
            </p>
            <span className="text-gray-400">•</span>
            <p className="text-gray-600">
              <span className="font-bold text-gray-900">{formatFileSize(files.reduce((acc, file) => acc + file.size, 0))}</span> total
            </p>
          </div>
        </div>
       
      </div>

      {/* Lista de archivos - Vista de lista */}
      {viewMode === 'list' && filteredFiles.length === 0 ? (
        <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
          <div className="h-24 w-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <FolderOpen className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold mb-3 text-gray-900">
            {searchTerm ? 'No files found' : 'No files available yet'}
          </h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">
            {searchTerm 
              ? 'Try different search terms or browse by category'
              : 'Course materials will appear here when available'
            }
          </p>
          {searchTerm && (
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('all');
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-gray-600 to-gray-700 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
            >
              Clear search
            </button>
          )}
        </div>
      ) : viewMode === 'list' ? (
        <div className="space-y-4">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="bg-white border border-gray-100 rounded-2xl p-6 hover:shadow-xl transition-all duration-300 group cursor-pointer hover:border-blue-200"
              onClick={() => handlePreview(file)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <div className={`h-14 w-14 rounded-xl ${getFileColor(file.type)} flex items-center justify-center text-white shadow-lg flex-shrink-0 group-hover:scale-105 transition-transform`}>
                    {getFileIcon(file.type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-lg text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                            {file.name}
                          </h3>
                          {file.isPublic ? (
                            <span className="px-2.5 py-1 bg-gradient-to-r from-green-100 to-emerald-100 text-green-700 text-xs font-bold rounded-full flex items-center gap-1">
                              <Globe className="h-3 w-3" />
                              Public
                            </span>
                          ) : (
                            <span className="px-2.5 py-1 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 text-xs font-bold rounded-full flex items-center gap-1">
                              <Lock className="h-3 w-3" />
                              Private
                            </span>
                          )}
                        </div>
                        
                        {/* Tags */}
                        {file.tags && file.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 mb-3">
                            {file.tags.map(tag => (
                              <span key={tag} className="px-2 py-1 bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700 text-xs rounded-full flex items-center gap-1">
                                <Tag className="h-3 w-3" />
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                        
                        {/* File info */}
                        <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{formatFileSize(file.size)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{formatDate(file.uploadedAt)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{file.uploadedBy}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Clock className="h-4 w-4 text-gray-400" />
                            <span className="font-medium">{formatTimeAgo(file.uploadedAt)}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    {/* Description */}
                    {file.description && (
                      <p className="text-gray-600 mt-3 line-clamp-2">
                        {file.description}
                      </p>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDownload(file);
                    }}
                    className="p-2.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-all duration-300 hover:scale-110"
                    title="Download"
                  >
                    <Download className="h-5 w-5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePreview(file);
                    }}
                    className="p-2.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-xl transition-all duration-300 hover:scale-110"
                    title="Preview"
                  >
                    <Eye className="h-5 w-5" />
                  </button>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-2 transition-all duration-300" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Vista de grid */}
      {viewMode === 'grid' && filteredFiles.length === 0 ? (
        <div className="bg-gradient-to-br from-gray-50 to-white border border-gray-100 rounded-2xl p-12 text-center shadow-sm">
          <div className="h-24 w-24 mx-auto mb-6 rounded-3xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
            <FolderOpen className="h-12 w-12 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold mb-3 text-gray-900">
            {searchTerm ? 'No files found' : 'No files available yet'}
          </h3>
          <p className="text-gray-500 max-w-md mx-auto mb-6">
            {searchTerm 
              ? 'Try different search terms or browse by category'
              : 'Course materials will appear here when available'
            }
          </p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredFiles.map((file) => (
            <div
              key={file.id}
              className="bg-white border border-gray-100 rounded-2xl p-5 hover:shadow-xl transition-all duration-300 group cursor-pointer hover:border-blue-200 flex flex-col h-full"
              onClick={() => handlePreview(file)}
            >
              <div className="flex-1">
                <div className={`h-12 w-12 rounded-xl ${getFileColor(file.type)} flex items-center justify-center text-white shadow-lg mb-4 group-hover:scale-105 transition-transform`}>
                  {getFileIcon(file.type)}
                </div>
                
                <h3 className="font-bold text-gray-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
                  {file.name}
                </h3>
                
                {file.description && (
                  <p className="text-sm text-gray-600 mb-3 line-clamp-2">
                    {file.description}
                  </p>
                )}
                
                {/* Tags */}
                {file.tags && file.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-3">
                    {file.tags.slice(0, 2).map(tag => (
                      <span key={tag} className="px-2 py-1 bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700 text-xs rounded-full">
                        {tag}
                      </span>
                    ))}
                    {file.tags.length > 2 && (
                      <span className="px-2 py-1 bg-gradient-to-r from-gray-50 to-gray-100 text-gray-700 text-xs rounded-full">
                        +{file.tags.length - 2}
                      </span>
                    )}
                  </div>
                )}
              </div>
              
              <div className="pt-4 border-t border-gray-100">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="font-medium">{formatFileSize(file.size)}</span>
                    <span>•</span>
                    <span>{formatTimeAgo(file.uploadedAt)}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDownload(file);
                      }}
                      className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all duration-300"
                      title="Download"
                    >
                      <Download className="h-4 w-4" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handlePreview(file);
                      }}
                      className="p-1.5 text-gray-500 hover:text-green-600 hover:bg-green-50 rounded-lg transition-all duration-300"
                      title="Preview"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Modal de vista previa */}
      {showPreviewModal && selectedFile && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-gray-200 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-gray-200 bg-gradient-to-r from-gray-50 to-white">
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <div className={`h-12 w-12 rounded-xl ${getFileColor(selectedFile.type)} flex items-center justify-center text-white shadow-sm`}>
                  {getFileIcon(selectedFile.type)}
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-xl text-gray-900 truncate">{selectedFile.name}</h3>
                  <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-gray-600">
                    <div className="flex items-center gap-1">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium">{formatFileSize(selectedFile.size)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      <span>Uploaded {formatDate(selectedFile.uploadedAt)}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <User className="h-4 w-4" />
                      <span>{selectedFile.uploadedBy}</span>
                    </div>
                    {selectedFile.isPublic ? (
                      <div className="flex items-center gap-1">
                        <Globe className="h-4 w-4 text-green-500" />
                        <span className="text-green-600 font-medium">Public</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Lock className="h-4 w-4 text-gray-500" />
                        <span className="text-gray-600">Private</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(selectedFile)}
                  className="p-2.5 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-xl transition-colors"
                  title="Download"
                >
                  <Download className="h-5 w-5" />
                </button>
                <button
                  onClick={toggleFullscreen}
                  className="p-2.5 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors"
                  title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
                >
                  <Maximize2 className="h-5 w-5" />
                </button>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(selectedFile.url);
                    alert('Link copied to clipboard!');
                  }}
                  className="p-2.5 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded-xl transition-colors"
                  title="Copy link"
                >
                  <Share2 className="h-5 w-5" />
                </button>
                <button
                  onClick={() => setShowPreviewModal(false)}
                  className="p-2.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-xl transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>

            {/* Contenido del archivo */}
            <div className="flex-1 overflow-hidden">
              {selectedFile.type.includes('pdf') ? (
                <iframe
                  id="pdf-iframe"
                  src={selectedFile.url}
                  className="w-full h-full min-h-[600px] border-0"
                  title={selectedFile.name}
                  loading="lazy"
                />
              ) : selectedFile.type.includes('image') ? (
                <div className="h-full overflow-auto p-6">
                  <img
                    src={selectedFile.url}
                    alt={selectedFile.name}
                    className="max-w-full h-auto mx-auto rounded-lg shadow-lg"
                  />
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-16 px-4">
                  <div className="h-24 w-24 mb-6 rounded-2xl bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                    {getFileIcon(selectedFile.type)}
                  </div>
                  <p className="text-xl font-bold text-gray-900 mb-3">Preview Not Available</p>
                  <p className="text-gray-500 text-center max-w-md mb-8">
                    This file type cannot be previewed directly in the browser. 
                    Please download the file to view its contents.
                  </p>
                  <button
                    onClick={() => handleDownload(selectedFile)}
                    className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-cyan-500 text-white rounded-xl hover:shadow-lg transition-all duration-300 font-medium"
                  >
                    <Download className="h-5 w-5" />
                    Download File
                  </button>
                </div>
              )}
            </div>

            {/* Descripción y tags */}
            <div className="border-t border-gray-200 p-6 bg-gray-50/50">
              {selectedFile.description && (
                <div className="mb-4">
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <BookOpen className="h-4 w-4 text-blue-500" />
                    Description
                  </h4>
                  <p className="text-gray-700">{selectedFile.description}</p>
                </div>
              )}
              
              {selectedFile.tags && selectedFile.tags.length > 0 && (
                <div>
                  <h4 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                    <Tag className="h-4 w-4 text-purple-500" />
                    Tags
                  </h4>
                  <div className="flex flex-wrap gap-2">
                    {selectedFile.tags.map(tag => (
                      <span key={tag} className="px-3 py-1.5 bg-gradient-to-r from-gray-100 to-gray-200 text-gray-700 text-sm rounded-full">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FileManager;