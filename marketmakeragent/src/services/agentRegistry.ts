import { AgentCapabilityCard } from '../types';

export class AgentRegistry {
	private agents: AgentCapabilityCard[];

	constructor(agents: AgentCapabilityCard[] = []) {
		this.agents = agents;
	}

	getAll(): AgentCapabilityCard[] {
		return this.agents;
	}
}
