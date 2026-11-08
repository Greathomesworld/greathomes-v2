import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import {
  projectIntelligenceService,
  ValidationError,
  NotFoundError,
} from '@/src/domain/projects/services/projectIntelligenceService';
import { projectRepository } from '@/src/infrastructure/repositories/projectProvider';
import { developerRepository } from '@/src/infrastructure/repositories/developerProvider';
import { ensureSeedData } from '@/src/infrastructure/seed';
import { requireAnyCapability, verifyStaffCapability } from '@/src/domain/auth/capabilities';
import { auditService } from '@/src/domain/audit/auditService';

export async function GET(request: NextRequest) {
  try {
    await ensureSeedData();

    // Verify staff authorization
    const auth = await requireAnyCapability(request, [
      'MANAGE_PROJECTS',
      'project.read',
      'faq.read',
    ]);

    if (!auth.authorized) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      );
    }

    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');

    if (mode === 'coverage') {
      const coverageAnalysis = await projectIntelligenceService.getFaqCoverageAnalysis();
      return NextResponse.json(coverageAnalysis);
    }

    const projectIdFilter = searchParams.get('projectId');
    const developerIdFilter = searchParams.get('developerId');
    const statusFilter = searchParams.get('status') || 'ALL'; // 'ALL' | 'PUBLISHED' | 'DRAFT'
    const searchQuery = (searchParams.get('query') || searchParams.get('search') || '').trim().toLowerCase();
    const sort = searchParams.get('sort') || 'createdAt:desc';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '50', 10)));

    // Fetch all FAQs enriched with canonical project metadata
    const [allFaqs, allProjects, allDevs] = await Promise.all([
      projectIntelligenceService.getAllFaqsWithProjects(),
      projectRepository.findAll(),
      developerRepository.list().catch(() => []),
    ]);

    // Compute authoritative stats across all projects
    const stats = {
      totalCount: allFaqs.length,
      publishedCount: allFaqs.filter((f) => f.isPublished).length,
      draftCount: allFaqs.filter((f) => !f.isPublished).length,
    };

    // Filter FAQs
    let filtered = allFaqs.filter((f) => {
      if (projectIdFilter && f.projectId !== projectIdFilter) {
        return false;
      }
      if (developerIdFilter && f.developerId !== developerIdFilter) {
        return false;
      }
      if (statusFilter === 'PUBLISHED' && !f.isPublished) {
        return false;
      }
      if (statusFilter === 'DRAFT' && f.isPublished) {
        return false;
      }
      if (searchQuery) {
        const matchesQuestion = f.question.toLowerCase().includes(searchQuery);
        const matchesAnswer = f.answer.toLowerCase().includes(searchQuery);
        const matchesProject = f.projectName.toLowerCase().includes(searchQuery);
        if (!matchesQuestion && !matchesAnswer && !matchesProject) {
          return false;
        }
      }
      return true;
    });

    // Apply sorting
    filtered.sort((a, b) => {
      switch (sort) {
        case 'sortOrder:asc':
          return (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
        case 'question:asc':
          return a.question.localeCompare(b.question);
        case 'createdAt:asc':
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        case 'createdAt:desc':
        default:
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
    });

    const total = filtered.length;
    const totalPages = Math.ceil(total / limit) || 1;
    const paginatedItems = filtered.slice((page - 1) * limit, page * limit);

    const projectsList = allProjects.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      status: p.status,
    }));

    const developersList = allDevs.map((d) => ({
      id: d.id,
      name: d.name,
      slug: d.slug,
    }));

    return NextResponse.json({
      items: paginatedItems,
      stats,
      projects: projectsList,
      developers: developersList,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
    });
  } catch (error: any) {
    console.error('[Admin FAQs API] GET failed:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureSeedData();

    // Verify staff authorization
    const auth = await verifyStaffCapability(request, 'MANAGE_PROJECTS');
    if (!auth.authorized) {
      return NextResponse.json(
        { error: auth.error || 'Unauthorized' },
        { status: auth.status || 401 }
      );
    }

    const body = await request.json();
    const { projectId, question, answer, sortOrder, isPublished } = body;

    if (!projectId || typeof projectId !== 'string' || !projectId.trim()) {
      return NextResponse.json(
        { error: 'Project ID is required' },
        { status: 400 }
      );
    }

    if (!question || typeof question !== 'string' || !question.trim()) {
      return NextResponse.json(
        { error: 'FAQ question is required and cannot be empty' },
        { status: 400 }
      );
    }

    if (!answer || typeof answer !== 'string' || !answer.trim()) {
      return NextResponse.json(
        { error: 'FAQ answer is required and cannot be empty' },
        { status: 400 }
      );
    }

    const created = await projectIntelligenceService.createFaq(
      projectId.trim(),
      {
        projectId: projectId.trim(),
        question: question.trim(),
        answer: answer.trim(),
        sortOrder: typeof sortOrder === 'number' ? sortOrder : parseInt(sortOrder, 10) || 0,
        isPublished: isPublished !== false,
      },
      true
    );

    // Revalidate affected routes
    const project = await projectIntelligenceService.getProjectById(projectId, true);
    if (project?.slug) {
      revalidatePath(`/projects/${project.slug}`);
    }
    revalidatePath(`/admin/projects/${projectId}`);
    revalidatePath('/admin/intelligence/faqs');

    // Audit log
    try {
      await auditService.record(request, auth.staff || auth, {
        action: 'PROJECT_FAQ_CREATED',
        resourceType: 'PROJECT_FAQ',
        resourceId: created.id,
        resourceLabel: created.question,
        after: created as any,
      });
    } catch (auditErr) {
      console.error('[Admin FAQs API] Audit log error:', auditErr);
    }

    return NextResponse.json(created, { status: 201 });
  } catch (error: any) {
    if (error instanceof NotFoundError) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error('[Admin FAQs API] POST failed:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
