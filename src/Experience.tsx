import ReferenceWordmark from './ReferenceWordmark';

const experience = [
  { company: 'Hudson River Trading', logo: 'hrt', period: 'May — Aug 2026', team: 'Trading Tech' },
  { company: 'Meta', logo: 'meta', period: 'May — Aug 2025', team: 'Dev Infrastructure' },
  { company: 'Stripe', logo: 'stripe', period: 'Jan — Apr 2025', team: 'Credit Detection: Merchant Credit ML' },
  { company: 'Amazon Web Services', logo: 'aws', period: 'May — Aug 2024', team: 'Aurora, Distributed DB' },
  { company: 'Arista Networks', logo: 'arista', period: 'Jan — Apr 2024', team: 'Strata Networking Platform' },
];
export default function ExperienceSection() {
  return <section id="experience" className="experience work-section">
    <div className="section-heading" data-reveal><h2 className="section-title">Internships</h2></div>
    <div className="internship-list">{experience.map(item => <article data-reveal className="internship-row" key={item.company}>
      <h3 className="employer-logo">{item.logo === 'hrt' || item.logo === 'stripe' ? <ReferenceWordmark brand={item.logo} /> : <img className={`employer-mark mark-${item.logo}`} src={`/logos/${item.logo}.svg`} alt={item.company} />}</h3>
      <p className="internship-team">{item.team}</p><p className="internship-period">{item.period}</p>
    </article>)}</div>
    <section id="education" className="education education-section"><h2 data-reveal className="section-title">Education</h2><div data-reveal className="education-summary"><div className="education-content"><p className="card-overline">UNIVERSITY OF BRITISH COLUMBIA</p><h3>Computer Science</h3><p>Bachelor of Science</p><div className="education-meta"><span>Graduated June 2026</span><span>Vancouver, BC</span></div></div></div></section>
  </section>;
}
