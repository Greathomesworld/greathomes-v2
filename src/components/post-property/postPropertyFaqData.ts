export interface PostPropertyFaqItem {
  id: string;
  question: string;
  answer: string;
}

export const POST_PROPERTY_FAQS: PostPropertyFaqItem[] = [
  {
    id: 'who-can-post',
    question: 'Who can post a property on Great Homes?',
    answer:
      'Property owners (or their authorized representatives) and approved Great Homes Listing Partner agencies can submit residential properties after verifying their mobile number with OTP. Great Homes maintains separate Property Owner and Listing Partner logins, and partner submissions require an ACTIVE staff-approved partner profile.',
  },
  {
    id: 'supported-categories',
    question: 'Which property types and listing purposes are supported?',
    answer:
      'You can submit residential Apartments, Independent Houses, and Residential Plots in Kolkata for either Resale (outright sale) or Rental / Lease. Commercial properties and unverified third-party reposts are not accepted.',
  },
  {
    id: 'photo-requirements',
    question: 'How many photographs do I need, and do I upload documents?',
    answer:
      'Every submission requires a minimum of 3 and up to 15 clear property photographs (JPEG, PNG, WebP, or AVIF). No ownership deeds, legal documents, or videos are collected or uploaded during the submission workflow.',
  },
  {
    id: 'verification-process',
    question: 'How does Great Homes verify and publish my listing?',
    answer:
      'Submitting a property never automatically publishes it. Every entry enters the Great Homes verification queue where our team manually reviews property configuration, locality mapping, uploaded photographs, and owner authority or partner consent before publication.',
  },
  {
    id: 'contact-privacy',
    question: 'Will my personal phone number be displayed publicly?',
    answer:
      'No. Your verified mobile identity stays private and is never published openly on the public listing page. Verified buyer and tenant enquiries are routed securely through Great Homes.',
  },
  {
    id: 'save-edit-withdraw',
    question: 'Can I save a draft, edit details, or withdraw my listing later?',
    answer:
      'Yes. Once you start Step 2 and sync your draft, your progress is saved automatically. You can resume drafts, respond to moderation change requests, or withdraw an existing submission anytime from My Property Submissions.',
  },
];
