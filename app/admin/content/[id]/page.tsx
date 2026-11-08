import { AdminContentEditorView } from '@/src/components/editorial/admin/AdminContentEditorView';
import { editorialService } from '@/src/domain/editorial/services/editorialService';
import { notFound } from 'next/navigation';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminContentEditPage({ params }: PageProps) {
  const { id } = await params;
  const article = await editorialService.getAdminArticleById(id);
  if (!article) {
    notFound();
  }
  return <AdminContentEditorView initialData={article} />;
}
