import { Icons } from "@/components/icons";
import { HomeIcon, NotebookIcon } from "lucide-react";

export const DATA = {
  name: "Ethan Lambeth",
  initials: "EL",
  url: "https://dillion.io",
  location: "Dunedin, NZ",
  locationLink: "https://www.google.com/maps/place/dunedin",
  description:
    "Studying BComm in Economics, minoring in Philosophy. I love building things and helping people. I am trying to blog more.",
  summary:
    "I am passionate about problem-solving, leadership, and creating positive change. I have a keen interest in governance structures and their impact on organizations and communities. I am currently pursuing a [Bachelor of Commerce in Economics, with a minor in Philosophy.](#education) I am committed to applying knowledge to solving real-world problems - [take a look at my side projects :-).](#projects) I'm now seeking further opportunities to leverage my experience and drive meaningful change.",
  avatarUrl: "/mecube.jpg",
  skills: [
    "Governance",
    "Financial Analysis",
    "Leadership",
    "Critical Thinking",
    "Public Speaking",
    "Presentation Skills",
    "Problem solving",
    "React",
    "Javascript",
    "Next.js",
    "Python",
    "SQL",


  ],
  navbar: [
    { href: "/", icon: HomeIcon, label: "Home" },
    { href: "/blog", icon: NotebookIcon, label: "Blog" },
  ],
  contact: {
    email: "elambethnz@gmail.com",
    tel: "+123456789",
    social: {
      GitHub: {
        name: "GitHub",
        url: "https://github.com/Elambeth/",
        icon: Icons.github,

        navbar: true,
      },
      LinkedIn: {
        name: "LinkedIn",
        url: "https://www.linkedin.com/in/ethan-lambeth/",
        icon: Icons.linkedin,

        navbar: true,
      },
      X: {
        name: "X",
        url: "https://dub.sh/dillion-twitter",
        icon: Icons.x,

        navbar: false,
      },
      Youtube: {
        name: "Youtube",
        url: "https://dub.sh/dillion-youtube",
        icon: Icons.youtube,
        navbar: false,
      },
      email: {
        name: "Send Email",
        url: "#contact",
        icon: Icons.email,

        navbar: true,
      },
    },
  },

  work: [
    {
      company: "Landsat Technologies ",
      href: "https://landsat.technology/",
      badges: [],
      location: "Texas, USA (Remote)",
      title: "Business Development Representative",
      logoUrl: "/landsat_logo.jpg",
      start: "October 2024",
      end: "January 2025",
      description:
        "I conducted targeted outreach to real estate developers for solar security solutions. I researched and identified key decision-makers within development companies. I created and optimized personalized email campaigns to engage property developers.",
    },
    {
      company: "Skillzea",
      href: "https://skillzea.net/",
      badges: [],
      location: "Dunedin, NZ",
      title: "Business Development Intern",
      logoUrl: "/skillzea.jpg",
      start: "October 2024",
      end: "January 2025",
      description:
        "In this part-time role, I'll be contributing to customer acquisition and retention strategies, enhancing Skillzea's social media presence, and engaging in promotional activities to support the company's growth.",
    },
    {
      company: "Age Concern Otago",
      href: "https://ageconcernotago.com/",
      badges: [],
      location: "Dunedin, NZ",
      title: "Executive Board Intern",
      logoUrl: "/ACO.png",
      start: "June 2024",
      end: "Present",
      description:
        "I support the organization's mission to enhance older people's wellbeing in the Otago region. This role provides me with valuable experience in non-profit governance and elder care advocacy while developing skills in strategic planning and community engagement.",
    },
    {
      company: "Ignite Consultants",
      href: "https://www.igniteconsultants.co.nz/",
      badges: [],
      location: "Dunedin, NZ",
      title: "Volunteer Consultant",
      logoUrl: "/ignite.png",
      start: "March 2023",
      end: "June 2023",
      description:
        "Worked in a team of six students to provide recommendations to Age Concern Otago a not-for-profit community organization that celebrates and advances the dignity, respect, and wellbeing of Otago’s older people.",
    },
  ],
  education: [
    {
      school: "Otago University",
      href: "https://www.otago.ac.nz/",
      degree: "Bachelor of Commerce in Economics with a Minor in Philosophy",
      logoUrl: "/university-of-otago-logo-profile.jpg",
      start: "2024",
      end: "Present",
    },
    {
      school: "Logan Park High School",
      href: "https://www.lphs.school.nz/",
      degree: "Head Boy + Board of Trustees representative",
      logoUrl: "/lphs.png",
      start: "2019",
      end: "2023",
    },
  ],
  projects: [
    {
      title: "NFP Toolkit",
      href: "https://nfptoolkit.org",
      dates: "July 2024 - Present",
      active: true,
      description:
        "NFP Toolkit empowers New Zealand's not-for-profits with user-friendly digital tools. Our solutions help Kiwi charities streamline operations, quantify their impact, and amplify their mission—all tailored to the unique needs of Aotearoa's charitable sector.",
      technologies: [
        "React",
        "HTML",
        "TailwindCSS",
        "Financial Analysis"
      ],
      links: [
        {
          type: "Website",
          href: "https://nfptoolkit.org",
          icon: <Icons.globe className="size-3" />,
        },
      ],
      image: "/nfptoolkit_homepage.png",
      video:
        "",
    },
    {
      title: "Teambuilder",
      href: "",
      dates: "January 2023 - December 2023",
      active: true,
      description:
        "Designed and developed a tool for school sports coordinators to assess and measure metrics of sport participation, providing statistical insights into student activity and engagement.",
      technologies: [
        "Flask",
        "SQLite",
        "HTML",
        "CSS",
      ],
      links: [

        {
          type: "Source",
          href: "https://github.com/Elambeth/Teambuilder",
          icon: <Icons.github className="size-3" />,
        },
      ],
      image: "/teambuilder.png",
      video: "",
    },

  ],
  hackathons: [

    {
      title: "Oceania Case Competition",
      dates: "August 24th - 25th, 2024",
      location: "Auckland, NZ",
      description:
        "For the short case competition placed 1st in our division, and 2nd overall out of 12 Universities from AUS/NZ. For the long case we pitched a strategy for expanding a2 Milk Company's market through partnerships with the China National Committee on Aging and India's National Dairy Development Board. The plan includes age-friendly products and lactose-free options tailored to local markets.",
      image:
        "a2milk.png",
      links: [
        {
          title: "Slide Deck",
          icon: <Icons.powerpoint className="h-4 w-4" />,
          href: "https://1drv.ms/p/c/c950e0d1c926d918/EeghtaZMyK9EnKDwylNrRDwBwW0l0a_mhoVO3uKnJpAR_w?e=hWICml",
        },

      ],
    },
    {
      title: "OBS Business Case Competition Programme",
      dates: "August 5th - 12th, 2024",
      location: "Dunedin, NZ",
      description:
        "Pitched a strategy for EMI Microfinance to incorporate green finance initiatives in Laos by offering affordable loans to farmers for water and energy-efficient irrigation systems. The plan focuses on Alternate Wetting and Drying (AWD) technology, projecting a 73% ROI over 3 years and aligning with environmental sustainability goals.",
      image:
        "EMI.png",
      links: [
        {
          title: "Slide Deck",
          icon: <Icons.powerpoint className="h-4 w-4" />,
          href: "https://1drv.ms/p/c/c950e0d1c926d918/ES_n8IthVUdNtEGieDody1YBxLyioUc3Vm7S_Y-80bl04w?e=ZbZe0W",
        },
      ],
    },
    {
      title: "PWC & COMSA Case Competiton",
      dates: "July 15 - 19th, 2024",
      location: "Dunedin, NZ",
      description:
        "Pitched a strategy for EcoFuel to pivot from petrol stations to EV charging stations, partnering with rental car companies to ensure demand. The plan integrates digital advertising at charging points, projecting a 275% ROI over 10 years and a $2.3 million NZD increase in operating cash flow.",
      image:
        "ecofuel.png",
      links: [
        {
          title: "Slide Deck",
          icon: <Icons.powerpoint className="h-4 w-4" />,
          href: "https://1drv.ms/p/c/c950e0d1c926d918/EdaFOcbjHUJFtLUGCDEa5wYBqS6AUn92dd7DtuTqBrCyog?e=vcsnJN",
        },

      ],
    },
    {
      title: "Victoria Business school Nationals",
      dates: "May 11, 2024",
      location: "Wellington, NZ",
      description:
        "Pitched a collaborative energy strategy for NZ Windfarms, partnering with local iwi to implement hydroelectric storage solutions, ensuring sustainable growth and long-term community benefits in the New Zealand energy market.",
      image:
        "NZ Windfarms.jpg",
      links: [
        {
          title: "Slide Deck",
          icon: <Icons.powerpoint className="h-4 w-4" />,
          href: "https://1drv.ms/p/c/c950e0d1c926d918/EfBs7iQTAxpPu6q1kjy05gAB3XGbJTHDlluzlhOn3-7FjQ?e=1vPKv5",
        },
      ],
    },
    {
      title: "Otago Internal competition Final",
      dates: "May 8, 2024",
      location: "Dunedin, NZ",
      description:
        "Pitched a partnership network for JPMC in the U.S. to leverage its extensive data infrastructure, enabling fintech companies to access JPMC’s resources while driving innovation and securing future market leadership.",
      image:
        "JPMC.png",
      links: [
        {
          title: "Slide Deck",
          icon: <Icons.powerpoint className="h-4 w-4" />,
          href: "https://1drv.ms/p/c/c950e0d1c926d918/EYwECY4SAjNLlz5Y3u_8cvIBbLrbzAL3t4IYSydN5ltxCg?e=cphDfm",
        },
      ],
    },
    {
      title: "Otago University Internal Competition",
      dates: "March 23, 2024",
      location: "Dunedin, Otago",
      description:
        "Pitched a rewards-based EcoCard system for P&G in the Philippines to incentivize sachet recycling, promote bulk buying, and enhance the brand’s sustainability efforts in the region.",
      image:
        "P&G.jpg",
      links: [
        {
          title: "Slide Deck",
          icon: <Icons.powerpoint className="h-4 w-4" />,
          href: "https://1drv.ms/p/c/c950e0d1c926d918/EaJCrnfvBI5ImX5A2lOBTTcBi_YqQxgpLM89SjdORCzD7g?e=1EodQY",
        },
      ],
    },
  ],
} as const;
